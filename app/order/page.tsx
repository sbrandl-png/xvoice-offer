// app/order/page.tsx
import React from "react";

export const runtime = "nodejs";       // wichtig: nicht Edge
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---- kleine Base64url-Helpers ----
function b64url(buf: Buffer | Uint8Array | string) {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : Buffer.from(buf);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64urlToBuf(b64u: string) {
  const pad = "===".slice((b64u.length + 3) % 4);
  return Buffer.from(b64u.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

async function hmacSha256(key: string, data: string) {
  const { createHmac } = await import("node:crypto"); // dynamisch, damit Edge nicht crasht
  return createHmac("sha256", key).update(data).digest();
}
async function timingSafeEqualSafe(a: Buffer, b: Buffer) {
  const { timingSafeEqual } = await import("node:crypto");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type Row = { sku: string; name: string; quantity: number; unit: number; total: number };
type OrderPayload = {
  offerId: string;
  customer: { company: string; contact: string; email: string; phone?: string };
  monthlyRows: Row[];
  oneTimeRows: Row[];
  vatRate: number;         // z.B. 0.19
  createdAt: number;       // epoch ms
};

const BRAND = { primary: "#ff4e00" };

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}

async function verifyToken(token: string) {
  const ORDER_SECRET = process.env.ORDER_SECRET || "";
  if (!ORDER_SECRET) return { ok: false as const, error: "ORDER_SECRET ist nicht gesetzt." };
  if (!token || typeof token !== "string") return { ok: false as const, error: "Token fehlt." };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false as const, error: "Token-Format ungültig." };

  const [headB64, bodyB64, sigB64] = parts;

  // Header prüfen
  let headerJson = "";
  try {
    headerJson = fromB64urlToBuf(headB64).toString("utf8");
    const header = JSON.parse(headerJson);
    if (!header || header.alg !== "HS256") {
      return { ok: false as const, error: "Header/Algorithmus nicht unterstützt." };
    }
  } catch {
    return { ok: false as const, error: "Header nicht lesbar." };
  }

  // Signatur prüfen
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

  // Payload decodieren
  try {
    const bodyJson = fromB64urlToBuf(bodyB64).toString("utf8");
    const payload = JSON.parse(bodyJson) as OrderPayload;
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, error: "Payload nicht lesbar." };
  }
}

export default async function OrderPage(props: { searchParams?: Record<string, string | string[]> }) {
  try {
    const tokenParam = props?.searchParams?.token;
    const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

    if (!token) {
      return (
        <ErrorBox
          title="Ungültiger oder beschädigter Bestelllink"
          message="Token-Parameter fehlt."
          fingerprint="missing-token"
        />
      );
    }

    const result = await verifyToken(token);

    if (!result.ok) {
      const short = token.slice(0, 10) + "…" + token.slice(-10);
      return (
        <ErrorBox
          title="Ungültiger oder beschädigter Bestelllink"
          message={result.error}
          fingerprint={`jwt:${short}`}
        />
      );
    }

    const { payload } = result;
    const mNet = payload.monthlyRows.reduce((a, r) => a + (r.total || 0), 0);
    const oNet = payload.oneTimeRows.reduce((a, r) => a + (r.total || 0), 0);
    const vatM = mNet * payload.vatRate;
    const vatO = oNet * payload.vatRate;

    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold mb-1">Bestellung bestätigen</h1>
        <p className="text-sm text-neutral-600 mb-6">
          Angebot <strong>{payload.offerId}</strong> · erstellt am{" "}
          {new Date(payload.createdAt).toLocaleString("de-DE")}
        </p>

        <section className="rounded-xl border p-4 mb-6">
          <h2 className="font-medium mb-2">Kundendaten</h2>
          <div className="text-sm">
            <div><strong>Firma:</strong> {payload.customer.company || "—"}</div>
            <div><strong>Ansprechpartner:</strong> {payload.customer.contact || "—"}</div>
            <div><strong>E-Mail:</strong> {payload.customer.email || "—"}</div>
            <div><strong>Telefon:</strong> {payload.customer.phone || "—"}</div>
          </div>
        </section>

        <section className="rounded-xl border p-4 mb-6">
          <h2 className="font-medium mb-2">Monatliche Positionen</h2>
          {payload.monthlyRows.length === 0 ? (
            <div className="text-sm text-neutral-600">Keine.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {payload.monthlyRows.map((r, i) => (
                <li key={`m-${i}`} className="flex justify-between gap-3">
                  <span>{r.quantity}× {r.name} ({r.sku})</span>
                  <span className="tabular-nums">{formatMoney(r.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 text-sm border-t pt-2">
            <div className="flex justify-between"><span>Zwischensumme (netto)</span><span className="tabular-nums">{formatMoney(mNet)}</span></div>
            <div className="flex justify-between"><span>zzgl. USt.</span><span className="tabular-nums">{formatMoney(vatM)}</span></div>
            <div className="flex justify-between font-semibold"><span>Brutto</span><span className="tabular-nums">{formatMoney(mNet + vatM)}</span></div>
          </div>
        </section>

        <section className="rounded-xl border p-4 mb-6">
          <h2 className="font-medium mb-2">Einmalige Positionen</h2>
          {payload.oneTimeRows.length === 0 ? (
            <div className="text-sm text-neutral-600">Keine.</div>
          ) : (
            <ul className="text-sm space-y-1">
              {payload.oneTimeRows.map((r, i) => (
                <li key={`o-${i}`} className="flex justify-between gap-3">
                  <span>{r.quantity}× {r.name} ({r.sku})</span>
                  <span className="tabular-nums">{formatMoney(r.total)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 text-sm border-t pt-2">
            <div className="flex justify-between"><span>Zwischensumme (netto)</span><span className="tabular-nums">{formatMoney(oNet)}</span></div>
            <div className="flex justify-between"><span>zzgl. USt.</span><span className="tabular-nums">{formatMoney(vatO)}</span></div>
            <div className="flex justify-between font-semibold"><span>Brutto</span><span className="tabular-nums">{formatMoney(oNet + vatO)}</span></div>
          </div>
        </section>

        <form action="/api/place-order" method="post" className="mt-6">
          {/* Token serverseitig verifizieren, aber zur Sicherheit noch mal ans API schicken */}
          <input type="hidden" name="orderIntent" value="true" />
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-white"
            style={{ background: BRAND.primary }}
          >
            Jetzt verbindlich bestellen
          </button>
        </form>
      </main>
    );
  } catch (e: any) {
    console.error("[/order] Uncaught:", e?.stack || e);
    return (
      <ErrorBox
        title="Application error"
        message="Interner Fehler beim Rendern der Bestellseite."
        fingerprint="order-page-uncaught"
      />
    );
  }
}

function ErrorBox({ title, message, fingerprint }: { title: string; message: string; fingerprint?: string }) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-xl font-semibold mb-2">{title}</h1>
      <p className="text-sm text-neutral-700">{message}</p>
      <p className="text-xs text-neutral-500 mt-2">Bitte fordere das Angebot erneut an oder kontaktiere unseren Support.</p>
      {fingerprint && (
        <p className="text-xs text-neutral-400 mt-2">
          Token-Fingerprint: {fingerprint}
        </p>
      )}
    </main>
  );
}
