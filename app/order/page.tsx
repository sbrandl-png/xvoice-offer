// app/order/page.tsx
import React from "react";
import { headers } from "next/headers";

// Laufzeit & Rendering auf Request erzwingen (damit ENV zur Request-Zeit gelesen wird)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type OrderRow = { sku: string; name: string; quantity: number; unit: number; total: number };
type OrderPayload = {
  offerId: string;
  customer: { company: string; contact: string; email: string; phone: string };
  salesperson?: { name: string; email: string; phone: string };
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;
  createdAt: number;
};

// ---- serverseitige JWT-Helfer (HMAC-SHA256, base64url) ----
function b64url(bytes: Uint8Array) {
  const b64 = Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlDecode(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

async function verifyOrderTokenServer(token: string): Promise<
  | { ok: true; payload: OrderPayload; unsigned?: boolean }
  | { ok: false; error: string }
> {
  try {
    if (!token) return { ok: false, error: "Kein Token" };
    const parts = token.split(".");
    if (parts.length < 2) return { ok: false, error: "Ungültiges Token-Format" };

    const [h, p, s = ""] = parts;
    const header = JSON.parse(b64urlDecode(h).toString("utf8")) as { alg: "HS256" | "none"; typ: string };
    const payload = JSON.parse(b64urlDecode(p).toString("utf8")) as OrderPayload;
    const msg = `${h}.${p}`;
    const secret = process.env.ORDER_SECRET;

    if (header.alg === "none") {
      return { ok: true, payload, unsigned: true };
    }

    if (!secret) {
      // Secret fehlt auf dem Server (falsches Env / nicht gesetzt)
      return { ok: false, error: "ORDER_SECRET ist nicht gesetzt." };
    }

    // HMAC SHA256 prüfen
    const crypto = await import("crypto");
    const mac = crypto.createHmac("sha256", secret).update(msg).digest();
    const given = b64urlDecode(s);

    if (given.length !== mac.length) return { ok: false, error: "Signaturlänge inkonsistent" };
    // timing-safe compare
    if (!crypto.timingSafeEqual(given, mac)) return { ok: false, error: "Signatur ungültig" };

    return { ok: true, payload };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// ---- Server Component: bekommt searchParams vom App Router ----
export default async function OrderPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const tokenRaw = searchParams?.token || "";
  const token = (() => {
    try {
      return decodeURIComponent(tokenRaw);
    } catch {
      return tokenRaw;
    }
  })();

  const result = await verifyOrderTokenServer(token);

  if (!token) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Ungültiger oder beschädigter Bestelllink</h1>
        <p className="text-sm text-red-700 mb-4">Kein Token gefunden.</p>
        <p className="text-sm">Bitte fordere das Angebot erneut an oder kontaktiere unseren Support.</p>
      </main>
    );
  }

  if (!result.ok) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Ungültiger oder beschädigter Bestelllink</h1>
        <p className="text-sm text-red-700 mb-2">Fehler: {result.error}</p>
        <p className="text-sm">Bitte fordere das Angebot erneut an oder kontaktiere unseren Support.</p>
      </main>
    );
  }

  const { payload, unsigned } = result;

  const mNet = payload.monthlyRows.reduce((a, r) => a + r.total, 0);
  const oNet = payload.oneTimeRows.reduce((a, r) => a + r.total, 0);
  const vatM = mNet * payload.vatRate;
  const vatO = oNet * payload.vatRate;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Bestellung bestätigen</h1>

      {unsigned && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          Hinweis: Token wurde ohne Signatur erstellt (unsigned). Bitte in der Produktion ein <code>ORDER_SECRET</code> setzen.
        </div>
      )}

      <section className="border rounded-lg p-4 space-y-2">
        <div className="text-sm"><strong>Angebotsnummer:</strong> {payload.offerId}</div>
        <div className="text-sm"><strong>Kunde:</strong> {payload.customer.company} · {payload.customer.contact}</div>
        <div className="text-sm"><strong>E-Mail:</strong> {payload.customer.email} · <strong>Telefon:</strong> {payload.customer.phone}</div>
      </section>

      <section className="border rounded-lg p-4">
        <h2 className="font-medium mb-2">Monatliche Positionen</h2>
        {payload.monthlyRows.length === 0 ? (
          <div className="text-sm opacity-70">Keine monatlichen Positionen.</div>
        ) : (
          <ul className="text-sm space-y-1">
            {payload.monthlyRows.map((r, i) => (
              <li key={`m-${i}`} className="flex justify-between">
                <span>{r.quantity}× {r.name} ({r.sku})</span>
                <span className="tabular-nums">{(r.total).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-sm border-t pt-2 flex justify-between">
          <span>Summe netto</span>
          <span className="tabular-nums">{mNet.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
        </div>
        <div className="text-sm flex justify-between">
          <span>zzgl. USt.</span>
          <span className="tabular-nums">{vatM.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
        </div>
      </section>

      <section className="border rounded-lg p-4">
        <h2 className="font-medium mb-2">Einmalige Positionen</h2>
        {payload.oneTimeRows.length === 0 ? (
          <div className="text-sm opacity-70">Keine einmaligen Positionen.</div>
        ) : (
          <ul className="text-sm space-y-1">
            {payload.oneTimeRows.map((r, i) => (
              <li key={`o-${i}`} className="flex justify-between">
                <span>{r.quantity}× {r.name} ({r.sku})</span>
                <span className="tabular-nums">{(r.total).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-sm border-t pt-2 flex justify-between">
          <span>Summe netto</span>
          <span className="tabular-nums">{oNet.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
        </div>
        <div className="text-sm flex justify-between">
          <span>zzgl. USt.</span>
          <span className="tabular-nums">{vatO.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
        </div>
      </section>

      <form action="/api/place-order" method="post" className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="inline-flex items-center px-4 py-2 rounded-md text-white"
          style={{ backgroundColor: "#ff4e00" }}
        >
          Bestellung verbindlich absenden
        </button>
      </form>
    </main>
  );
}
