// app/order/page.tsx
import type { Metadata } from "next";
import crypto from "crypto";

// Falls du SEO-Titel willst
export const metadata: Metadata = {
  title: "xVoice UC – Bestellung prüfen",
};

// Seite muss dynamisch sein, weil sie sich nach dem Querystring richtet
export const dynamic = "force-dynamic";

// ---------- Typen, passend zum Signer ----------
type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  unit: number;   // Nettopreis pro Einheit (bereits rabattiert)
  total: number;  // Nettosumme (quantity * unit)
};

type OrderPayload = {
  offerId: string;
  customer: {
    company: string;
    contact: string;
    email: string;
    phone: string;
  };
  salesperson: {
    name: string;
    email: string;
    phone: string;
  };
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;     // z.B. 0.19
  createdAt: number;   // epoch ms
};

// ---------- Hilfen ----------
function cleanToken(raw: string): string {
  if (!raw) return "";
  let t = raw.trim();

  // Versuche genau einmal zu dekodieren (falls doppelt-encodiert, bricht das hier nicht)
  try { t = decodeURIComponent(t); } catch {}

  // Falls eine ganze URL eingefügt wurde: nur den token-Query nehmen
  const m = t.match(/[?&]token=([^&]+)/);
  if (m) t = m[1];

  // Quotes / spitze Klammern ab
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1);
  t = t.replace(/^<+|>+$/g, "");

  // HTML-Entities, Zero-Width, Whitespaces
  t = t.replace(/&amp;/g, "&");
  t = t.replace(/[\u200B-\u200D\uFEFF]/g, "");
  t = t.replace(/\s+/g, "");

  // Nur Base64url-Zeichen + Punkte erlauben
  t = t.replace(/[^A-Za-z0-9._-]/g, "");

  return t;
}

function b64urlToBuf(b64url: string): Buffer {
  // Base64url -> Base64
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  // Padding ergänzen
  const pad = b64.length % 4;
  const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
  return Buffer.from(padded, "base64");
}

function bufToB64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function formatMoneyEUR(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}

function timeSince(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("de-DE");
}

// ---------- Verifikation ----------
async function verifyOrderTokenServer(token: string): Promise<{ ok: true; payload: OrderPayload } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: "Kein Token übergeben" };

  const ORDER_SECRET = process.env.ORDER_SECRET;
  if (!ORDER_SECRET) return { ok: false, error: "ORDER_SECRET ist nicht gesetzt" };

  // Erwartet: header.payload.signature (JWS-ähnlich, HS256)
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Token-Format ungültig (Teile != 3)" };

  const [h, p, s] = parts;

  // Header/Payload als JSON einlesen
  let headerJson: any;
  let payloadJson: any;
  try {
    const headerBuf = b64urlToBuf(h);
    const payloadBuf = b64urlToBuf(p);
    headerJson = JSON.parse(headerBuf.toString("utf8"));
    payloadJson = JSON.parse(payloadBuf.toString("utf8"));
  } catch {
    return { ok: false, error: "Header nicht lesbar" };
  }

  // Nur HS256 zulassen
  const alg = String(headerJson?.alg || "");
  if (alg !== "HS256") return { ok: false, error: `Unerwarteter Algorithmus: ${alg}` };

  // Signatur prüfen
  try {
    const unsigned = `${h}.${p}`;
    const mac = crypto.createHmac("sha256", Buffer.from(ORDER_SECRET, "utf8"));
    mac.update(unsigned);
    const expected = bufToB64url(mac.digest());
    const safeEqual =
      expected.length === s.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s));

    if (!safeEqual) return { ok: false, error: "Signatur ungültig" };
  } catch (e) {
    return { ok: false, error: "Signaturprüfung fehlgeschlagen" };
  }

  // Grobe Strukturprüfung des Payloads
  const pl = payloadJson as OrderPayload;
  if (
    !pl ||
    typeof pl.offerId !== "string" ||
    !Array.isArray(pl.monthlyRows) ||
    !Array.isArray(pl.oneTimeRows) ||
    typeof pl.vatRate !== "number"
  ) {
    return { ok: false, error: "Payload unvollständig oder ungültig" };
  }

  return { ok: true, payload: pl };
}

// ---------- Seite ----------
export default async function OrderPage({ searchParams }: { searchParams: { token?: string } }) {
  const tokenRaw = searchParams?.token || "";
  const token = cleanToken(tokenRaw);

  const result = await verifyOrderTokenServer(token);

  if (!result.ok) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Ungültiger oder beschädigter Bestelllink</h1>
        <p className="text-sm text-red-700 mb-4">Fehler: {result.error}</p>
        <p className="text-sm">
          Bitte fordere das Angebot erneut an oder kontaktiere unseren Support.
        </p>
        {!!token && (
          <p className="mt-3 text-xs text-gray-500">
            Token-Fingerprint: {token.slice(0, 12)}… (len {token.length})
          </p>
        )}
      </main>
    );
  }

  const { payload } = result;

  const mNet = payload.monthlyRows.reduce((a, r) => a + r.total, 0);
  const oNet = payload.oneTimeRows.reduce((a, r) => a + r.total, 0);
  const vatM = mNet * payload.vatRate;
  const vatO = oNet * payload.vatRate;
  const grossM = mNet + vatM;
  const grossO = oNet + vatO;

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
            {payload.monthlyRows.map((r) => (
              <div key={`m-${r.sku}`} className="flex items-center justify-between text-sm">
                <div>{r.quantity}× {r.name} ({r.sku})</div>
                <div className="tabular-nums">{formatMoneyEUR(r.total)}</div>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t text-sm grid grid-cols-[1fr_auto] gap-x-6">
              <span>Zwischensumme netto</span><span className="text-right tabular-nums">{formatMoneyEUR(mNet)}</span>
              <span>zzgl. USt. ({Math.round(payload.vatRate * 100)}%)</span><span className="text-right tabular-nums">{formatMoneyEUR(vatM)}</span>
              <span className="font-semibold">Brutto</span><span className="text-right tabular-nums font-semibold">{formatMoneyEUR(grossM)}</span>
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
            {payload.oneTimeRows.map((r) => (
              <div key={`o-${r.sku}`} className="flex items-center justify-between text-sm">
                <div>{r.quantity}× {r.name} ({r.sku})</div>
                <div className="tabular-nums">{formatMoneyEUR(r.total)}</div>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t text-sm grid grid-cols-[1fr_auto] gap-x-6">
              <span>Zwischensumme netto</span><span className="text-right tabular-nums">{formatMoneyEUR(oNet)}</span>
              <span>zzgl. USt. ({Math.round(payload.vatRate * 100)}%)</span><span className="text-right tabular-nums">{formatMoneyEUR(vatO)}</span>
              <span className="font-semibold">Brutto</span><span className="text-right tabular-nums font-semibold">{formatMoneyEUR(grossO)}</span>
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
          <div className="text-xs text-gray-500 mt-2">Erstellt am {timeSince(payload.createdAt)}</div>
        </div>
      </section>

      {/* Hier würdest du den abschließenden Bestätigen-Flow einbauen (POST /api/place-order o.ä.) */}
      <div className="text-xs text-gray-500 text-center">
        Prüfe die Angaben. Bei Fragen melde dich gern bei uns – vielen Dank!
      </div>
    </main>
  );
}
