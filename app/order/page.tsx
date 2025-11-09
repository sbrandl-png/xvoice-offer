// app/order/page.tsx
import React from "react";

// Server-only: ENV zur Request-Zeit lesen
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

// ---------- helpers ----------
function b64urlToBuffer(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (b64.length % 4)) % 4;
  const b64p = b64 + "=".repeat(padLen);
  return Buffer.from(b64p, "base64");
}

async function safeParsePayload(buf: Buffer): Promise<any> {
  // 1) direkter UTF-8 JSON Versuch
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch (_) {}

  // 2) zlib/gzip erkennen & entpacken
  const zlib = await import("zlib");
  const isGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const looksZlib = buf.length >= 2 && (buf[0] === 0x78 && (buf[1] === 0x01 || buf[1] === 0x9c || buf[1] === 0xda));

  if (isGzip) {
    const unzipped = zlib.gunzipSync(buf);
    return JSON.parse(unzipped.toString("utf8"));
  }
  if (looksZlib) {
    const inflated = zlib.inflateSync(buf);
    return JSON.parse(inflated.toString("utf8"));
  }

  // 3) letzter Versuch: latin1->utf8
  try {
    return JSON.parse(Buffer.from(buf.toString("binary"), "binary").toString("utf8"));
  } catch (e) {
    throw new Error(`Payload nicht lesbar: ${String((e as Error).message || e)}`);
  }
}

async function verifyOrderTokenServer(tokenRaw: string): Promise<
  | { ok: true; payload: OrderPayload; unsigned?: boolean }
  | { ok: false; error: string }
> {
  try {
    if (!tokenRaw) return { ok: false, error: "Kein Token" };
    // Token aus URL holen (einmal decodieren – nicht doppelt!)
    let token = tokenRaw;
    try { token = decodeURIComponent(tokenRaw); } catch {}

    const parts = token.split(".");
    if (parts.length < 2) return { ok: false, error: "Ungültiges Token-Format" };

    const [h, p, s = ""] = parts;

    // Header lesen
    const headerBuf = b64urlToBuffer(h);
    let header: { alg: "HS256" | "none"; typ?: string };
    try {
      header = JSON.parse(headerBuf.toString("utf8"));
    } catch {
      return { ok: false, error: "Header nicht lesbar" };
    }

    // Payload robust parsen (siehe safeParsePayload)
    const payloadBuf = b64urlToBuffer(p);
    const payload = await safeParsePayload(payloadBuf);

    // Signatur prüfen (außer alg: none)
    if (header.alg === "none") {
      return { ok: true, payload, unsigned: true };
    }

    const secret = process.env.ORDER_SECRET;
    if (!secret) return { ok: false, error: "ORDER_SECRET ist nicht gesetzt." };

    const crypto = await import("crypto");
    const msg = Buffer.from(`${h}.${p}`, "utf8");
    const mac = crypto.createHmac("sha256", secret).update(msg).digest();
    const given = b64urlToBuffer(s);

    if (given.length !== mac.length) return { ok: false, error: "Signaturlänge inkonsistent" };
    if (!crypto.timingSafeEqual(given, mac)) return { ok: false, error: "Signatur ungültig" };

    return { ok: true, payload };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// ---------- Server Component ----------
export default async function OrderPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const tokenParam = searchParams?.token || "";
  const result = await verifyOrderTokenServer(tokenParam);

  if (!tokenParam) {
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
                <span className="tabular-nums">{r.total.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
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
                <span className="tabular-nums">{r.total.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
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
        <input type="hidden" name="token" value={decodeURIComponent(tokenParam)} />
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
