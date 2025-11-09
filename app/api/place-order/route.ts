// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// ---------- Helpers ----------
function getEnv(name: string, req?: NextRequest): string {
  const v = process.env[name];
  if (!v || !v.length) {
    const hint = name === "ORDER_SECRET"
      ? "Setze in Vercel eine Environment Variable ORDER_SECRET (z. B. 32+ zufällige Bytes als Hex/Base64)."
      : `Environment Variable ${name} fehlt.`;
    throw apiError(500, `${name} ist nicht gesetzt. ${hint}`);
  }
  return v;
}

function apiError(status: number, message: string) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function json(data: any, init?: ResponseInit) {
  return new NextResponse(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    ...init,
  });
}

function b64urlEncode(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlFromJSON(obj: any) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  return b64urlEncode(json);
}
function b64urlToBuffer(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = 4 - (b64.length % 4 || 4);
  return Buffer.from(b64 + "=".repeat(pad), "base64");
}

function signHS256(data: string, secret: string) {
  const h = createHmac("sha256", Buffer.from(secret, "utf8"));
  h.update(data);
  const sig = h.digest();
  return b64urlEncode(sig);
}

function safeTimingEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false; // verhindert "Input buffers must have the same byte length"
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Very light type guard
function isOrderPayload(p: any): p is {
  offerId: string;
  customer: { company?: string; contact?: string; email?: string; phone?: string };
  monthlyRows: Array<{ sku: string; name: string; quantity: number; unit: number; total: number }>;
  oneTimeRows: Array<{ sku: string; name: string; quantity: number; unit: number; total: number }>;
  vatRate: number;
  createdAt: number;
} {
  return (
    p &&
    typeof p === "object" &&
    typeof p.offerId === "string" &&
    p.customer && typeof p.customer === "object" &&
    Array.isArray(p.monthlyRows) &&
    Array.isArray(p.oneTimeRows) &&
    typeof p.vatRate === "number" &&
    typeof p.createdAt === "number"
  );
}

// ---------- JWT (HS256) ----------
function makeToken(payload: any, secret: string, kid = "xv1") {
  const header = { alg: "HS256", typ: "JWT", kid };
  const part1 = b64urlFromJSON(header);
  const part2 = b64urlFromJSON(payload);
  const data = `${part1}.${part2}`;
  const sig = signHS256(data, secret);
  return `${data}.${sig}`;
}

function verifyToken(token: string, secret: string): { ok: true; payload: any } | { ok: false; error: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "Token-Format ungültig" };

    const [pHeader, pPayload, pSig] = parts;
    if (!pHeader || !pPayload || !pSig) return { ok: false, error: "Token unvollständig" };

    // Signatur prüfen
    const data = `${pHeader}.${pPayload}`;
    const expectedSig = signHS256(data, secret);
    const a = b64urlToBuffer(pSig);
    const b = b64urlToBuffer(expectedSig);
    if (!safeTimingEqual(a, b)) return { ok: false, error: "Signatur ungültig" };

    // Payload parsen
    const json = b64urlToBuffer(pPayload).toString("utf8");
    const obj = JSON.parse(json);
    return { ok: true, payload: obj };
  } catch (e: any) {
    return { ok: false, error: "Token-Validierung fehlgeschlagen" };
  }
}

// ---------- Routes ----------
export async function GET() {
  // Simple Healthcheck/Debug
  return json({ ok: true, service: "place-order", time: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Ungültiger JSON-Body.");
  }

  const secret = getEnv("ORDER_SECRET", req);
  const kid = process.env.ORDER_KID || "xv1";

  // --- SIGN ONLY ---
  if (body?.signOnly) {
    const payload = body?.payload;
    if (!isOrderPayload(payload)) {
      return apiError(400, "Payload unvollständig oder ungültig für die Signatur.");
    }

    // Optional: iat/exp hinzufügen (hier 48h Gültigkeit)
    const now = Math.floor(Date.now() / 1000);
    const signedPayload = { ...payload, iat: now, exp: now + 48 * 3600 };

    const token = makeToken(signedPayload, secret, kid);
    return json({ ok: true, token });
  }

  // --- SUBMIT ORDER ---
  if (body?.submit) {
    const token = String(body?.token || "");
    const accept = !!body?.accept;
    const signer = body?.signer || {};
    const context = body?.context || {};

    if (!token) return apiError(400, "Fehlender Token.");
    if (!accept) return apiError(400, "AGB/Widerruf/Datenschutz wurden nicht bestätigt.");
    if (!signer?.name || !signer?.email) return apiError(400, "Unterzeichner (Name & E-Mail) erforderlich.");

    const v = verifyToken(token, secret);
    if (!v.ok) return apiError(400, v.error);

    const payload = v.payload;
    if (!isOrderPayload(payload)) return apiError(400, "Payload im Token ist ungültig.");
    if (payload.exp && Math.floor(Date.now() / 1000) > Number(payload.exp)) {
      return apiError(400, "Token abgelaufen.");
    }

    // Order-ID generieren
    const orderId = `ORD-${Date.now()}`;

    // Optional: Webhook an euer Backend/CRM (best-effort)
    const webhook = process.env.ORDER_WEBHOOK_URL;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            token,
            signer,
            payload,
            context,
            meta: {
              ip: req.headers.get("x-forwarded-for") || req.ip || null,
              ua: req.headers.get("user-agent") || null,
              receivedAt: new Date().toISOString(),
            },
          }),
        });
      } catch {
        // bewusst nur loggen – Bestellung gilt trotzdem als angenommen
        console.warn("[ORDER_WEBHOOK_URL] Zustellung fehlgeschlagen.");
      }
    }

    // TODO: Hier könntest du E-Mail-Bestätigung(en) triggern
    // z.B. an Kunde, Vertrieb & interne Mailbox.

    return json({ ok: true, orderId });
  }

  // Fallback
  return apiError(400, "Ungültiger Request. Verwende { signOnly:true, payload } oder { submit:true, token, ... }.");
}
