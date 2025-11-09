// app/order/page.tsx
import type { Metadata } from "next";
import crypto from "crypto";

export const metadata: Metadata = { title: "xVoice UC – Bestellung prüfen" };
export const dynamic = "force-dynamic";

// ---- Types (müssen zu deinem Signer passen) ----
type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  unit: number;
  total: number;
};
type OrderPayload = {
  offerId: string;
  customer: { company: string; contact: string; email: string; phone: string };
  salesperson: { name: string; email: string; phone: string };
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;
  createdAt: number;
};

// ---- Helpers ----
function cleanToken(raw: string): string {
  if (!raw) return "";
  let t = raw.trim();
  try { t = decodeURIComponent(t); } catch {}
  const m = t.match(/[?&]token=([^&]+)/);
  if (m) t = m[1];
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1);
  t = t.replace(/^<+|>+$/g, "").replace(/&amp;/g, "&").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "");
  // nur Base64url-Zeichen, Punkt, Unterstrich, Minus + "plain" erlauben
  t = t.replace(/[^A-Za-z0-9._-]/g, "");
  return t;
}
function b64urlToBuf(b64url: string): Buffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  return Buffer.from(pad ? b64 + "=".repeat(4 - pad) : b64, "base64");
}
function bufToB64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function formatMoneyEUR(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}
function niceTs(ts: number) { return new Date(ts).toLocaleString("de-DE"); }

// ---- Verification (unterstützt Header "plain" oder Base64url-JSON mit alg HS256) ----
async function verifyOrderTokenServer(token: string): Promise<{ ok: true; payload: OrderPayload } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: "Kein Token übergeben" };
  const ORDER_SECRET = process.env.ORDER_SECRET;
  if (!ORDER_SECRET) return { ok: false, error: "ORDER_SECRET ist nicht gesetzt" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Token-Format ungültig (Teile != 3)" };
  const [h, p, s] = parts;

  // Header interpretieren
  let alg = "HS256";
  if (h !== "plain") {
    try {
      const headerJson = JSON.parse(b64urlToBuf(h).toString("utf8"));
      alg = String(headerJson?.alg || "HS256");
    } catch {
      return { ok: false, error: "Header nicht lesbar" };
    }
  }
  if (alg !== "HS256") return { ok: false, error: `Unerwarteter Algorithmus: ${alg}` };

  // Payload lesen
  let payloadJson: any;
  try {
    payloadJson = JSON.parse(b64urlToBuf(p).toString("utf8"));
  } catch {
    return { ok: false, error: "Payload nicht lesbar" };
  }

  // Signatur prüfen über `${h}.${p}`
  try {
    const unsigned = `${h}.${p}`;
    const mac = crypto.createHmac("sha256", Buffer.from(ORDER_SECRET, "utf8"));
    mac.update(unsigned);
    const expected = bufToB64url(mac.digest());

    const safe =
      expected.length === s.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s));
    if (!safe) return { ok: false, error: "Signatur ungültig" };
  } catch {
    return { ok: false, error: "Signaturprüfung fehlgeschlagen" };
  }

  // Struktur checken
  const pl = payloadJson as OrderPayload;
  if (!pl || typeof pl.offerId !== "string" || !Array.isArray(pl.monthlyRows) || !Array.isArray(pl.oneTimeRows) || typeof pl.vatRate !== "number") {
    return { ok: false, error: "Payload unvollständig oder ungültig" };
  }
  return { ok: true, payload: pl };
}

// ---- Page (Server Component) ----
export default async function OrderPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = cleanToken(searchParams?.token || "");
  const result = await verifyOrderTokenServer(token);

  if (!result.ok) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Ungültiger oder beschädigter Bestelllink</h1>
        <p className="text-sm text-red-700 mb-4">Fehler: {result.error}</p>
        <p className="text-sm">Bitte fordere das Angebot erneut an oder kontaktiere unseren Support.</p>
        {!!token && <p className="mt-3 text-xs text-gray-500">Token-Fingerprint: {token.slice(0, 12)}… (len {token.length})</p>}
      </main>
    );
  }

  const { payload } = result;
  const mNet = payload.monthlyRows.reduce((a, r) => a + r.total, 0);
  const oNet = payload.oneTimeRows.reduce((a, r) => a + r.total, 0);
  const vatM = mNet * payload.vatRate;
  const vatO = oNet * payload.vatRate;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bestellung prüfen</h1>
        <span className="text-xs text-gray-500">Angebot: {payload.offerId}</span>
      </header>

      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold mb-2">Kunde</h2>
        <div className="text-sm">
          <div><strong>Firma:</strong> {payload.customer.company || "—"}</div>
          <div><strong>Ansprechpartner:</strong> {payload.customer.contact || "—"}</div>
          <div><strong>E-Mail:</strong> {payload.customer.email || "—"}</div>
          <div><strong>Telefon:</strong> {payload.customer.phone || "—"}</div>
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold mb-3">Monatliche Positionen</h2>
        {payload.monthlyRows.length === 0 ? (
          <div className="text-sm text-gray-500">Keine monatlichen Positionen.</div>
        ) : (
          <div className="space-y-2">
            {payload.monthlyRows.map(r => (
              <div key={`m-${r.sku}`} className="flex items-center justify-between text-sm">
                <div>{r.quantity}× {r.name} ({r.sku})</div>
                <div className="tabular-nums">{formatMoneyEUR(r.total)}</div>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t text-sm grid grid-cols-[1fr_auto] gap-x-6">
              <span>Zwischensumme netto</span><span className="text-right tabular-nums">{formatMoneyEUR(mNet)}</span>
              <span>zzgl. USt. ({Math.round(payload.vatRate * 100)}%)</span><span className="text-right tabular-nums">{formatMoneyEUR(vatM)}</span>
              <span className="font-semibold">Brutto</span><span className="text-right tabular-nums font-semibold">{formatMoneyEUR(mNet + vatM)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold mb-3">Einmalige Positionen</h2>
        {payload.oneTimeRows.length === 0 ? (
          <div className="text-sm text-gray-500">Keine einmaligen Positionen.</div>
        ) : (
          <div className="space-y-2">
            {payload.oneTimeRows.map(r => (
              <div key={`o-${r.sku}`} className="flex items-center justify-between text-sm">
                <div>{r.quantity}× {r.name} ({r.sku})</div>
                <div className="tabular-nums">{formatMoneyEUR(r.total)}</div>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t text-sm grid grid-cols-[1fr_auto] gap-x-6">
              <span>Zwischensumme netto</span><span className="text-right tabular-nums">{formatMoneyEUR(oNet)}</span>
              <span>zzgl. USt. ({Math.round(payload.vatRate * 100)}%)</span><span className="text-right tabular-nums">{formatMoneyEUR(vatO)}</span>
              <span className="font-semibold">Brutto</span><span className="text-right tabular-nums font-semibold">{formatMoneyEUR(oNet + vatO)}</span>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-sm font-semibold mb-2">Vertrieb</h2>
        <div className="text-sm">
          <div><strong>Name:</strong> {payload.salesperson.name || "—"}</div>
          <div><strong>E-Mail:</strong> {payload.salesperson.email || "—"}</div>
          <div><strong>Telefon:</strong> {payload.salesperson.phone || "—"}</div>
          <div className="text-xs text-gray-500 mt-2">Erstellt am {niceTs(payload.createdAt)}</div>
        </div>
      </section>

      <div className="text-xs text-gray-500 text-center">
        Prüfe die Angaben. Bei Fragen melde dich gern bei uns – vielen Dank!
      </div>
    </main>
  );
}
