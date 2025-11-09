// lib/orderToken.ts
import crypto from "crypto";

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export type OrderPayload = {
  offerId: string;
  customer: {
    company?: string;
    contact?: string;
    email?: string;
    phone?: string;
  };
  salesperson?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  monthlyRows: Array<{ sku: string; name: string; quantity: number; unit: number; total: number }>;
  oneTimeRows: Array<{ sku: string; name: string; quantity: number; unit: number; total: number }>;
  vatRate: number;     // z.B. 0.19
  createdAt: number;   // Date.now()
};

const getSecret = () => {
  const secret = process.env.ORDER_SECRET;
  if (!secret) throw new Error("ORDER_SECRET fehlt.");
  return secret;
};

// Signiert ein JSON-Payload als compact token: <base64url(json)>.<base64url(sig)>
export function signOrderPayload(payload: OrderPayload): string {
  const json = JSON.stringify(payload);
  const data = b64url(json);
  const sig = crypto.createHmac("sha256", getSecret()).update(data).digest();
  const token = `${data}.${b64url(sig)}`;
  return token;
}

// Verifiziert und liefert Payload zurück oder wirft einen Fehler
export function verifyOrderToken(token: string): OrderPayload {
  const [data, sigB64] = token.split(".");
  if (!data || !sigB64) throw new Error("Ungültiger Token");
  const expected = crypto.createHmac("sha256", getSecret()).update(data).digest();
  const given = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new Error("Signatur ungültig");
  }
  const json = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const parsed = JSON.parse(json);
  return parsed;
}
