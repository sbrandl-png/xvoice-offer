// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs"; // wir nutzen Node's crypto

// ---- Helpers ----
function b64url(input: Buffer | string) {
  const b =
    typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return b.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
function b64urlJSON(obj: unknown) {
  return b64url(Buffer.from(JSON.stringify(obj), "utf8"));
}
function hmacSHA256(key: string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

const ORDER_SECRET = process.env.ORDER_SECRET || "";

// ---- Core: Signieren / Verifizieren ----
function signPayload(payload: any) {
  if (!ORDER_SECRET) {
    return { ok: false as const, error: "ORDER_SECRET ist nicht gesetzt." };
  }
  // Minimale Plausibilitätschecks, damit wir keine Binärdaten signieren
  if (!payload || typeof payload !== "object") {
    return { ok: false as const, error: "Ungültige Payload." };
  }
  // Header im JWT-Stil
  const header = { alg: "HS256", typ: "JWT", kid: "xv1" };
  const head = b64urlJSON(header);
  const body = b64urlJSON(payload);
  const toSign = `${head}.${body}`;
  const sigBuf = hmacSHA256(ORDER_SECRET, toSign);
  const sig = b64url(sigBuf);
  return { ok: true as const, token: `${head}.${body}.${sig}` };
}

function verifyToken(token: string) {
  if (!ORDER_SECRET) {
    return { ok: false as const, error: "ORDER_SECRET ist nicht gesetzt." };
  }
  if (!token || typeof token !== "string" || token.split(".").length !== 3) {
    return { ok: false as const, error: "Token-Format ungültig." };
  }
  const [headB64, bodyB64, sigB64] = token.split(".");
  // Re-Signatur berechnen
  const toSign = `${headB64}.${bodyB64}`;
  const expected = hmacSHA256(ORDER_SECRET, toSign);
  // Eingehende Signatur dekodieren
  const padded = sigB64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((sigB64.length + 3) % 4);
  let got: Buffer;
  try {
    got = Buffer.from(padded, "base64");
  } catch {
    return { ok: false as const, error: "Signatur nicht lesbar." };
  }
  // WICHTIG: nur timingSafeEqual wenn Längen identisch sind
  if (got.length !== expected.length) {
    return { ok: false as const, error: "Signatur ungültig (Länge)." };
  }
  const valid = crypto.timingSafeEqual(got, expected);
  if (!valid) {
    return { ok: false as const, error: "Signatur ungültig." };
  }
  // Payload zurückgeben
  try {
    const bodyJson = Buffer.from(
      bodyB64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((bodyB64.length + 3) % 4),
      "base64"
    ).toString("utf8");
    const payload = JSON.parse(bodyJson);
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, error: "Payload nicht lesbar." };
  }
}

// ---- Handlers ----
export async function POST(req: NextRequest) {
  try {
    const data = await req.json().catch(() => null);
    if (!data || typeof data !== "object") {
      return NextResponse.json({ ok: false, error: "Body fehlt/ungültig." }, { status: 400 });
    }

    // 1) Nur signieren (für /order-Link in der E-Mail & Button)
    if (data.signOnly) {
      const { payload } = data as { payload: any };
      const res = signPayload(payload);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, token: res.token });
    }

    // 2) Order-Intent mit vorhandenen Token (optional Logging/Pre-Order)
    if (data.orderIntent) {
      const token = String((data as any).token || "");
      const check = verifyToken(token);
      if (!check.ok) {
        return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
      }

      // TODO: hier könntest du Logging/DB etc. machen
      // const payload = check.payload;

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unbekannte Operation." }, { status: 400 });
  } catch (e: any) {
    console.error("place-order POST error:", e?.stack || e);
    return NextResponse.json({ ok: false, error: "Serverfehler" }, { status: 500 });
  }
}

// GET als Fallback (z. B. für alte Clients)
export async function GET() {
  return NextResponse.json({ ok: true, info: "place-order endpoint" });
}

