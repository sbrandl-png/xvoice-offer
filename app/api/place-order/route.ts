// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";          // harte Node-Runtime
export const dynamic = "force-dynamic";   // nie prerendert/cached
export const revalidate = 0;

// --- kleine Base64url-Helpers ---
function b64url(buf: Buffer | Uint8Array | string) {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : Buffer.from(buf);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlJSON(obj: unknown) {
  return b64url(Buffer.from(JSON.stringify(obj), "utf8"));
}
function fromB64urlToBuf(b64u: string) {
  const pad = "===".slice((b64u.length + 3) % 4);
  return Buffer.from(b64u.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function bad(status: number, msg: string, extra?: any) {
  console.error("[place-order]", msg, extra ?? "");
  return NextResponse.json({ ok: false, error: msg }, { status });
}

async function hmacSha256(key: string, data: string) {
  // dynamisch laden -> verhindert Edge/Import-Probleme
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", key).update(data).digest();
}

async function timingSafeEqualSafe(a: Buffer, b: Buffer) {
  const { timingSafeEqual } = await import("node:crypto");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const ORDER_SECRET = process.env.ORDER_SECRET ?? "";

async function signPayload(payload: any) {
  if (!ORDER_SECRET) return { ok: false as const, error: "ORDER_SECRET ist nicht gesetzt." };
  if (!payload || typeof payload !== "object") return { ok: false as const, error: "Ungültige Payload." };

  const header = { alg: "HS256", typ: "JWT", kid: "xv1" };
  const head = b64urlJSON(header);
  const body = b64urlJSON(payload);
  const toSign = `${head}.${body}`;
  const sig = await hmacSha256(ORDER_SECRET, toSign);
  return { ok: true as const, token: `${toSign}.${b64url(sig)}` };
}

async function verifyToken(token: string) {
  if (!ORDER_SECRET) return { ok: false as const, error: "ORDER_SECRET ist nicht gesetzt." };
  if (!token || typeof token !== "string") return { ok: false as const, error: "Token fehlt." };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false as const, error: "Token-Format ungültig." };

  const [headB64, bodyB64, sigB64] = parts;
  let headerJson = "";
  try {
    headerJson = fromB64urlToBuf(headB64).toString("utf8");
    JSON.parse(headerJson); // nur Validierung
  } catch {
    return { ok: false as const, error: "Header nicht lesbar." };
  }

  const toSign = `${headB64}.${bodyB64}`;
  const expected = await hmacSha256(ORDER_SECRET, toSign);

  let got: Buffer;
  try {
    got = fromB64urlToBuf(sigB64);
  } catch {
    return { ok: false as const, error: "Signatur nicht lesbar." };
  }

  if (!(await timingSafeEqualSafe(got, expected))) {
    return { ok: false as const, error: "Signatur ungültig." };
  }

  try {
    const bodyJson = fromB64urlToBuf(bodyB64).toString("utf8");
    const payload = JSON.parse(bodyJson);
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, error: "Payload nicht lesbar." };
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json().catch(() => null);
    if (!data || typeof data !== "object") return bad(400, "Body fehlt/ungültig.");

    // 1) Client will nur signieren
    if ((data as any).signOnly) {
      const res = await signPayload((data as any).payload);
      if (!res.ok) return bad(400, res.error);
      return NextResponse.json({ ok: true, token: res.token });
    }

    // 2) Order-Intent mit Token prüfen
    if ((data as any).orderIntent) {
      const token = String((data as any).token || "");
      const res = await verifyToken(token);
      if (!res.ok) return bad(400, res.error);
      // TODO: optional Logging/DB
      return NextResponse.json({ ok: true });
    }

    return bad(400, "Unbekannte Operation.");
  } catch (e: any) {
    console.error("[place-order] Uncaught:", e?.stack || e);
    return bad(500, "Serverfehler");
  }
}

export async function GET() {
  // einfacher Health-Check
  return NextResponse.json({ ok: true, runtime, hasSecret: Boolean(ORDER_SECRET) });
}
