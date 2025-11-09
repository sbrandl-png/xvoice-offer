// lib/orderToken.ts (Server-only benutzt)
import crypto from "crypto";

function getSecret() {
  const s = process.env.ORDER_SECRET;
  if (!s) {
    throw new Error("Server: ORDER_SECRET fehlt.");
  }
  return s;
}

export function signOrderPayload(payload: object): string {
  const secret = getSecret();
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOrderToken(token: string) {
  const secret = getSecret();
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false as const, error: "Malformed token" };
  const expect = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    return { ok: false as const, error: "Invalid signature" };
  }
  try {
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return { ok: true as const, payload: decoded };
  } catch {
    return { ok: false as const, error: "Invalid payload" };
  }
}
