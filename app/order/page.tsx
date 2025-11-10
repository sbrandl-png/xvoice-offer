"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

// ---------- Typen (gleichlaufend zur API) ----------
type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  unit: number; // Netto Einzelpreis
  total: number; // Netto Zeilensumme
};

type Customer = {
  company?: string;
  contact?: string;
  email?: string;
  phone?: string;
  street?: string;
  zip?: string;
  city?: string;
};

type OrderPayload = {
  offerId: string;
  customer?: Customer;
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number; // 0.19 etc.
  createdAt?: number;
};

// ---------- Utils ----------
const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
function euro(n: number) {
  return EUR.format(n);
}
function num(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}
function decodeTokenUnsafe(token: string): any | null {
  try {
    if (token.includes(".")) {
      const part = token.split(".")[1]!;
      const json = Buffer.from(part, "base64url").toString("utf8");
      return JSON.parse(json);
    }
    const json = Buffer.from(token, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function normalizeOrder(input: any): OrderPayload | null {
  if (!input) return null;

  const monthlyRows: OrderRow[] =
    input.monthlyRows ?? input.monthly ?? input.recurring ?? [];
  const oneTimeRows: OrderRow[] =
    input.oneTimeRows ?? input.oneTime ?? input.setup ?? [];
  const vatRate: number = typeof input.vatRate === "number" ? input.vatRate : input.vat;

  const offerId = input.offerId;
  if (
    typeof offerId !== "string" ||
    !offerId.trim() ||
    !Array.isArray(monthlyRows) ||
    !Array.isArray(oneTimeRows) ||
    typeof vatRate !== "number"
  ) {
    return null;
  }

  const order: OrderPayload = {
    offerId,
    customer: input.customer ?? {},
    monthlyRows,
    oneTimeRows,
    vatRate,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : Date.now(),
  };
  return order;
}

function calcTotals(order: OrderPayload) {
  const netMonthly = order.monthlyRows.reduce((s, r) => s + num(r.total), 0);
  const netOneTime = order.oneTimeRows.reduce((s, r) => s + num(r.total), 0);
  const vatMonthly = netMonthly * order.vatRate;
  const vatOneTime = netOneTime * order.vatRate;
  const grossMonthly = netMonthly + vatMonthly;
  const grossOneTime = netOneTime + vatOneTime;
  return { netMonthly, netOneTime, vatMonthly, vatOneTime, grossMonthly, grossOneTime };
}

function Table({ rows }: { rows: OrderRow[] }) {
  if (!rows?.length) {
    return <p className="text-sm text-gray-500">Keine Positionen.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-700">SKU</th>
            <th className="px-3 py-2 text-left font-medium text-gray-700">Bezeichnung</th>
            <th className="px-3 py-2 text-right font-medium text-gray-700">Menge</th>
            <th className="px-3 py-2 text-right font-medium text-gray-700">Einzelpreis (netto)</th>
            <th className="px-3 py-2 text-right font-medium text-gray-700">Summe (netto)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-gray-900">{r.sku}</td>
              <td className="px-3 py-2 text-gray-900">{r.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.quantity)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{euro(num(r.unit))}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{euro(num(r.total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Page ----------
export default function OrderPage() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const decoded = useMemo(() => (token ? decodeTokenUnsafe(token) : null), [token]);
  const rawOrder = decoded?.order ?? decoded ?? null;
  const order: OrderPayload | null = useMemo(() => normalizeOrder(rawOrder), [rawOrder]);

  const [signerName, setSignerName] = useState<string>("");
  const [signerEmail, setSignerEmail] = useState<string>("");
  const [salesEmail, setSalesEmail] = useState<string>("");
  const [accept, setAccept] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    try {
      setLoading(true);
      setError(null);

      if (!token) throw new Error("Fehlender Token-Parameter.");
      if (!order) throw new Error("Die Bestelldaten im Token sind unvollständig oder ungültig.");
      if (!accept) throw new Error("Bitte AGB/Einverständnis bestätigen.");

      const res = await fetch("/api/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit: true,
          token,
          signer: {
            name: signerName || undefined,
            email: signerEmail || undefined,
          },
          salesEmail: salesEmail || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || `Unerwarteter Fehler (${res.status}).`);
      }

      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-lg w-full bg-white shadow-md rounded-xl p-8 text-center">
          <img
            src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x"
            alt="xVoice Logo"
            className="mx-auto h-16 mb-6"
          />
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">
            Vielen Dank für Ihre Bestellung!
          </h1>
          <p className="text-gray-700 leading-relaxed mb-6">
            Ihre Auftragsbestätigung wurde erfolgreich übermittelt.
            Unser Team bereitet nun die Bereitstellung Ihrer xVoice UC Lösung vor.
          </p>
          <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-600 mb-6">
            Um die technische Umsetzung und Konfiguration gemeinsam zu besprechen,
            können Sie direkt einen Termin für das Kick-off-Gespräch buchen:
          </div>
          <a
            href="https://calendly.com/s-brandl-xvoice-uc/xvoice-uc-kickoff-meeting"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#ff4e00] text-white font-medium px-6 py-3 rounded-lg hover:bg-[#e24400] transition-colors"
          >
            Kick-off-Gespräch jetzt buchen
          </a>

          <p className="text-xs text-gray-500 mt-8">
            © {new Date().getFullYear()} xVoice UC UG (haftungsbeschränkt) · Peter-Müller-Straße 3, 40468 Düsseldorf ·{" "}
            <a href="https://www.xvoice-uc.de/impressum" className="underline">
              Impressum & Datenschutz
            </a>
          </p>
        </div>
      </main>
    );
  }

  // Fehlerzustände bzgl. Token/Order vor der Interaktion
  if (!token) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-12">
        <div className="max-w-lg w-full bg-white shadow-md rounded-xl p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-3">Fehlender Token</h1>
          <p className="text-gray-700">
            Diese Seite benötigt einen gültigen Token-Parameter (<code>?token=...</code>), um die Bestellung anzuzeigen.
          </p>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-12">
        <div className="max-w-lg w-full bg-white shadow-md rounded-xl p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-3">Ungültige Bestelldaten</h1>
          <p className="text-gray-700">
            Die Bestelldaten im Token sind unvollständig oder konnten nicht gelesen werden.
          </p>
        </div>
      </main>
    );
  }

  const { netMonthly, netOneTime, vatMonthly, vatOneTime, grossMonthly, grossOneTime } =
    useMemo(() => calcTotals(order), [order]);

  const c = order.customer ?? {};

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="bg-[#111114] rounded-t-xl px-6 py-5 flex items-center gap-4">
          <img
            src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x"
            alt="xVoice Logo"
            className="h-8"
          />
          <h1 className="text-white text-lg font-semibold">
            Bestellung bestätigen – Angebot {order.offerId}
          </h1>
        </div>

        {/* Übergang / Divider für stimmigen Look */}
        <div className="h-2 bg-gradient-to-b from-[#111114] to-transparent rounded-b-xl" />

        {/* Inhalt */}
        <div className="bg-white shadow-md rounded-xl p-6 mt-2 space-y-8">
          {/* Adresskasten */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Kundendaten</h2>
            <div className="rounded-lg border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Firma:</span> <span className="font-medium">{c.company || "–"}</span></div>
              <div><span className="text-gray-500">Kontakt:</span> <span className="font-medium">{c.contact || "–"}</span></div>
              <div><span className="text-gray-500">E-Mail:</span> <span className="font-medium">{c.email || "–"}</span></div>
              <div><span className="text-gray-500">Telefon:</span> <span className="font-medium">{c.phone || "–"}</span></div>
              <div className="md:col-span-2">
                <span className="text-gray-500">Adresse:</span>{" "}
                <span className="font-medium">
                  {[c.street, c.zip, c.city].filter(Boolean).join(", ") || "–"}
                </span>
              </div>
            </div>
          </section>

          {/* Zusammenfassung */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Monatlich</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <div className="flex justify-between"><span>Netto</span><span className="tabular-nums">{euro(netMonthly)}</span></div>
                <div className="flex justify-between"><span>USt ({(order.vatRate * 100).toFixed(0)}%)</span><span className="tabular-nums">{euro(vatMonthly)}</span></div>
                <div className="flex justify-between font-semibold"><span>Brutto</span><span className="tabular-nums">{euro(grossMonthly)}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Einmalig</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <div className="flex justify-between"><span>Netto</span><span className="tabular-nums">{euro(netOneTime)}</span></div>
                <div className="flex justify-between"><span>USt ({(order.vatRate * 100).toFixed(0)}%)</span><span className="tabular-nums">{euro(vatOneTime)}</span></div>
                <div className="flex justify-between font-semibold"><span>Brutto</span><span className="tabular-nums">{euro(grossOneTime)}</span></div>
              </div>
            </div>
          </section>

          {/* Positionslisten */}
          <section className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Monatliche Positionen</h2>
              <Table rows={order.monthlyRows} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Einmalige Positionen</h2>
              <Table rows={order.oneTimeRows} />
            </div>
          </section>

          {/* Signer + Vertrieb */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Unterzeichner</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="text-gray-700">Name</span>
                  <input
                    type="text"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    placeholder="Max Mustermann"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-gray-700">E-Mail</span>
                  <input
                    type="email"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    placeholder="m.mustermann@firma.de"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                (Optional – wird zusätzlich benachrichtigt, falls angegeben.)
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Vertrieb</h3>
              <label className="text-sm block">
                <span className="text-gray-700">E-Mail des Vertriebs (optional)</span>
                <input
                  type="email"
                  value={salesEmail}
                  onChange={(e) => setSalesEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="vorname.nachname@xvoice-uc.de"
                />
              </label>
              <p className="text-xs text-gray-500 mt-2">
                Vertrieb erhält zusätzlich die Auftragsbestätigung. Immer an{" "}
                <span className="font-medium">vertrieb@xvoice-uc.de</span>.
              </p>
            </div>
          </section>

          {/* Zustimmung */}
          <section className="flex items-start gap-3">
            <input
              id="accept"
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-[#ff4e00] focus:ring-[#ff4e00]"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
            />
            <label htmlFor="accept" className="text-sm text-gray-700">
              Ich bestätige die verbindliche Bestellung gemäß Angebot{" "}
              <span className="font-medium">{order.offerId}</span> und den Konditionen.
            </label>
          </section>

          {/* Fehlermeldung */}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* CTA */}
          <div>
            <button
              onClick={handleSubmit}
              disabled={loading || !accept}
              className="w-full bg-[#ff4e00] text-white font-semibold py-3 rounded-lg hover:bg-[#e24400] transition-colors disabled:opacity-60"
            >
              {loading ? "Wird übermittelt …" : "Jetzt verbindlich bestellen"}
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
              Mit Klick auf „Jetzt verbindlich bestellen“ werden Ihre Daten zur Auftragsbearbeitung übermittelt.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-gray-500 mt-6 text-center">
          © {new Date().getFullYear()} xVoice UC UG (haftungsbeschränkt) · Peter-Müller-Straße 3, 40468 Düsseldorf ·{" "}
          <a href="https://www.xvoice-uc.de/impressum" className="underline">
            Impressum & Datenschutz
          </a>
        </p>
      </div>
    </main>
  );
}
