// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// ---------- Helpers ----------
function apiError(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
function json(data: any, init?: ResponseInit) {
  return new NextResponse(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    ...init,
  });
}
function getEnv(name: string) {
  const v = process.env[name];
  if (!v) {
    const hint =
      name === "ORDER_SECRET"
        ? "Setze in Vercel ORDER_SECRET (32+ zufällige Bytes als sicherer String)."
        : `Environment Variable ${name} fehlt.`;
    throw apiError(500, `${name} ist nicht gesetzt. ${hint}`);
  }
  return v;
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
  const padLen = (4 - (b64.length % 4)) % 4;
  return Buffer.from(b64 + "=".repeat(padLen), "base64");
}

function signHS256(data: string, secret: string) {
  const h = createHmac("sha256", Buffer.from(secret, "utf8"));
  h.update(data);
  return b64urlEncode(h.digest());
}
function safeTimingEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------- Types ----------
type OrderRow = { sku: string; name: string; quantity: number; unit: number; total: number };
type OrderPayloadBase = {
  offerId: string;
  customer: { company?: string; contact?: string; email?: string; phone?: string };
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;
  createdAt: number;
  // JWT Felder optional:
  iat?: number;
  exp?: number;
};
function isOrderPayload(p: any): p is OrderPayloadBase {
  return (
    p &&
    typeof p === "object" &&
    typeof p.offerId === "string" &&
    p.customer &&
    typeof p.customer === "object" &&
    Array.isArray(p.monthlyRows) &&
    Array.isArray(p.oneTimeRows) &&
    typeof p.vatRate === "number" &&
    typeof p.createdAt === "number"
  );
}

// ---------- JWT ----------
function makeToken(payload: OrderPayloadBase, secret: string, kid = "xv1") {
  const header = { alg: "HS256", typ: "JWT", kid };
  const part1 = b64urlFromJSON(header);
  const part2 = b64urlFromJSON(payload);
  const data = `${part1}.${part2}`;
  const sig = signHS256(data, secret);
  return `${data}.${sig}`;
}
function verifyToken(
  token: string,
  secret: string
): { ok: true; payload: OrderPayloadBase } | { ok: false; error: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "Token-Format ungültig" };
    const [pHeader, pPayload, pSig] = parts;
    if (!pHeader || !pPayload || !pSig) return { ok: false, error: "Token unvollständig" };

    const expectedSig = signHS256(`${pHeader}.${pPayload}`, secret);
    const a = b64urlToBuffer(pSig);
    const b = b64urlToBuffer(expectedSig);
    if (!safeTimingEqual(a, b)) return { ok: false, error: "Signatur ungültig" };

    const json = b64urlToBuffer(pPayload).toString("utf8");
    const obj = JSON.parse(json);
    if (!isOrderPayload(obj)) return { ok: false, error: "Payload im Token ist ungültig" };
    return { ok: true, payload: obj };
  } catch {
    return { ok: false, error: "Token-Validierung fehlgeschlagen" };
  }
}

// ---------- Routes ----------
export async function GET() {
  return json({ ok: true, service: "place-order", time: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Ungültiger JSON-Body.");
  }

  const secret = getEnv("ORDER_SECRET");
  const kid = process.env.ORDER_KID || "xv1";

  // --- SIGN ONLY ---
  if (body?.signOnly) {
    const payload = body?.payload as OrderPayloadBase;
    if (!isOrderPayload(payload)) {
      return apiError(400, "Payload unvollständig oder ungültig für die Signatur.");
    }
    const now = Math.floor(Date.now() / 1000);
    const signedPayload: OrderPayloadBase = {
      ...payload,
      iat: now,
      exp: now + 48 * 3600, // 48h
    };
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

    const payload = v.payload; // hat optional exp/iat im Typ
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && nowSec > payload.exp) {
      return apiError(400, "Token abgelaufen.");
    }

    const orderId = `ORD-${Date.now()}`;

    // Optional: Webhook
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
              ip: req.headers.get("x-forwarded-for") || null,
              ua: req.headers.get("user-agent") || null,
              receivedAt: new Date().toISOString(),
            },
          }),
        });
      } catch {
        console.warn("[ORDER_WEBHOOK_URL] Zustellung fehlgeschlagen (wird ignoriert).");
      }
    }

    // TODO: E-Mail-Bestätigung(en) triggern, wenn gewünscht
    return json({ ok: true, orderId });
  }

  return apiError(400, "Ungültiger Request. Verwende { signOnly:true, payload } oder { submit:true, token, ... }.");
}
