// lib/orderToken.ts
import crypto from "crypto";

// ---- Typen, die wir systemweit verwenden ----
export type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  listUnit: number;
  offerUnit: number;
  listTotal: number;
  offerTotal: number;
};

export type Customer = {
  company?: string;
  contact?: string;
  email?: string;
  phone?: string;
  street?: string;
  zip?: string;
  city?: string;
};

export type OrderPayload = {
  offerId: string;
  vatRate: number;
  customer: Customer;
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  // optional: Ablaufzeit
  exp?: number; // Unix-Timestamp (Sekunden)
};

// ---- kleine Helfer ----
function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function hmac(data: string, secret: string) {
  return b64url(crypto.createHmac("sha256", secret).update(data).digest());
}

function getSecret(secret?: string) {
  const s = secret ?? process.env.ORDER_SECRET;
  if (!s) throw new Error("ORDER_SECRET ist nicht gesetzt.");
  return s;
}

// ---- Signieren (nur Server verwenden!) ----
export function signOrderPayload(payload: OrderPayload, secret?: string) {
  const sec = getSecret(secret);
  const body = JSON.stringify(payload);
  const bodyB64 = b64url(body);
  const sig = hmac(bodyB64, sec);
  return `${bodyB64}.${sig}`;
}

// ---- Verifizieren ----
export function verifyOrderToken(
  token: string,
  secret?: string
):
  | { ok: true; payload: OrderPayload }
  | { ok: false; error: string } {
  try {
    const sec = getSecret(secret);
    const [bodyB64, sig] = token.split(".");
    if (!bodyB64 || !sig) {
      return { ok: false, error: "Token-Format ungültig." };
    }
    const expected = hmac(bodyB64, sec);
    if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) === false) {
      return { ok: false, error: "Signatur ungültig." };
    }
    const json = Buffer.from(
      bodyB64.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    const payload = JSON.parse(json) as OrderPayload;

    if (typeof payload.offerId !== "string" || !payload.offerId.trim()) {
      return { ok: false, error: "offerId fehlt." };
    }
    if (typeof payload.vatRate !== "number") {
      return { ok: false, error: "vatRate ungültig." };
    }
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return { ok: false, error: "Token abgelaufen." };
    }

    return { ok: true, payload };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
