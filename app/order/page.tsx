// app/order/page.tsx
import type { Metadata } from "next";
import crypto from "crypto";

export const metadata: Metadata = { title: "xVoice UC – Bestellung prüfen" };
export const dynamic = "force-dynamic";

// ------- Typen (passend zum Signer) -------
type OrderRow = { sku: string; name: string; quantity: number; unit: number; total: number };
type OrderPayload = {
  offerId: string;
  customer: { company: string; contact: string; email: string; phone: string };
  salesperson: { name: string; email: string; phone: string };
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;
  createdAt: number;
};

// ------- Utils -------
function cleanToken(raw?: string): string {
  if (!raw) return "";
  let t = raw.trim();
  try { t = decodeURIComponent(t); } catch {}
  const m = t.match(/[?&]token=([^&]+)/);
  if (m) t = m[1];
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1);
  t = t.replace(/^<+|>+$/g, "").replace(/&amp;/g, "&").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "");
  return t.replace(/[^A-Za-z0-9._-]/g, "");
}
function b64urlToBuf(b64url: string): Buffer {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  return Buffer.from(pad ? b64 + "=".repeat(4 - pad) : b64, "base64");
}
function bufToB64(buf: Buffer) { return buf.toString("base64").replace(/=+$/g, ""); }
function bufToB64url(buf: Buffer) { return bufToB64(buf).replace(/\+/g, "-").replace(/\//g, "_"); }
function isHex(s: string) { return /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0; }
function tryDecodeSecretVariants(secretRaw: string): Buffer[] {
  const out: Buffer[] = [];
  const push = (b: Buffer) => { if (b.length && !out.some(x => x.equals(b))) out.push(b); };
  push(Buffer.from(secretRaw, "utf8"));
  try { push(Buffer.from(secretRaw, "base64")); } catch {}
  if (isHex(secretRaw)) { try { push(Buffer.from(secretRaw, "hex")); } catch {} }
  try { push(b64urlToBuf(secretRaw)); } catch {}
  return out;
}
function formatMoneyEUR(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}
function niceTs(ts: number) { return new Date(ts).toLocaleString("de-DE"); }

// ------- flexible Signature-Checks -------
function makeMac(buf: Buffer | string, key: Buffer) {
  return crypto.createHmac("sha256", key).update(buf).digest();
}
function equalLoose(expected: string, provided: string): boolean {
  const norm = (s: string) => s.replace(/=+$/g, "");
  const a = norm(expected);
  const b = norm(provided);
  // direkter Vergleich
  if (a.length === b.length) {
    try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch {}
  }
  // URL/Base64 Normalisierung
  if (a.replace(/\+/g, "-").replace(/\//g, "_") === b) return true;
  if (a.replace(/-/g, "+").replace(/_/g, "/") === b) return true;
  return false;
}

function verifySignatureFlexible(unsignedCandidates: (string|Buffer)[], sigProvided: string, secretRaw: string): boolean {
  const sig = sigProvided.replace(/=+$/g, "");
  const secrets = tryDecodeSecretVariants(secretRaw);
  for (const key of secrets) {
    for (const msg of unsignedCandidates) {
      const mac = makeMac(msg, key);
      // Kandidaten für Signatur-String
      const candidates = [
        bufToB64url(mac),                // base64url
        bufToB64(mac),                   // base64 (no pad)
        mac.toString("base64"),          // base64 (pad)
        mac.toString("hex"),             // hex
        // hex-as-ascii => b64url / b64 (für exotische Client-Implementierungen)
        bufToB64url(Buffer.from(mac.toString("hex"), "utf8")),
        bufToB64(Buffer.from(mac.toString("hex"), "utf8")),
      ];
      if (candidates.some(c => equalLoose(c, sig))) return true;
    }
  }
  return false;
}

// ------- Token-Verify (unterstützt 'plain'-Header & Payload-only-Signatur) -------
async function verifyOrderTokenServer(token: string): Promise<{ ok: true; payload: OrderPayload } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: "Kein Token übergeben" };
  const ORDER_SECRET = process.env.ORDER_SECRET;
  if (!ORDER_SECRET) return { ok: false, error: "ORDER_SECRET ist nicht gesetzt" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Token-Format ungültig (Teile != 3)" };
  const [h, p, s] = parts;

  // Header
  let alg = "HS256";
  if (h !== "plain") {
    try { alg = String(JSON.parse(b64urlToBuf(h).toString("utf8"))?.alg || "HS256"); }
    catch { return { ok: false, error: "Header nicht lesbar" }; }
  }
  if (alg !== "HS256") return { ok: false, error: `Unerwarteter Algorithmus: ${alg}` };

  // Payload
  let payloadJson: any;
  try { payloadJson = JSON.parse(b64urlToBuf(p).toString("utf8")); }
  catch { return { ok: false, error: "Payload nicht lesbar" }; }

  // Unsigned-Kandidaten:
  // 1) klassisch: "header.payload"
  // 2) abweichend: nur "payload"
  const unsignedCandidates: (string|Buffer)[] = [
    `${h}.${p}`,
    p,
    // Roh-JSON-String (falls Client nicht b64url nutzt)
    Buffer.from(JSON.stringify(payloadJson), "utf8"),
  ];

  const ok = verifySignatureFlexible(unsignedCandidates, s, ORDER_SECRET);
  if (!ok) return { ok: false, error: "Signatur ungültig" };

  // Struktur prüfen
  const pl = payloadJson as OrderPayload;
  if (!pl || typeof pl.offerId !== "string" || !Array.isArray(pl.monthlyRows) || !Array.isArray(pl.oneTimeRows) || typeof pl.vatRate !== "number") {
    return { ok: false, error: "Payload unvollständig oder ungültig" };
  }
  return { ok: true, payload: pl };
}

// ------- Page (Server Component) -------
export default async function OrderPage({ searchParams }: { searchParams?: { token?: string } }) {
  const token = cleanToken(searchParams?.token);
  const verify = await verifyOrderTokenServer(token);

  if (!verify.ok) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Ungültiger oder beschädigter Bestelllink</h1>
        <p className="text-sm text-red-700 mb-4">Fehler: {verify.error}</p>
        <p className="text-sm">Bitte fordere das Angebot erneut an oder kontaktiere unseren Support.</p>
        {!!token && <p className="mt-3 text-xs text-gray-500">Token-Fingerprint: {token.slice(0, 12)}… (len {token.length})</p>}
      </main>
    );
  }

  const { payload } = verify;
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
          <div className="text-xs text-gray-500 mt-2">Erstellt am {niceTs(payload.createdAt)}</div>
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
        </div>
      </section>

      <div className="text-xs text-gray-500 text-center">
        Prüfe die Angaben. Bei Fragen melde dich gern bei uns – vielen Dank!
      </div>
    </main>
  );
}
