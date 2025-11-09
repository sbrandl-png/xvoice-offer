"use client";

import React, { useEffect, useMemo, useState } from "react";

type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  unit: number;   // Netto-Einzelpreis (Angebot)
  total: number;  // Netto-Zeile (Angebot)
  billing?: "monthly" | "one-time";
  desc?: string;
};

type OrderCustomer = {
  company?: string;
  contact?: string;
  email?: string;
  phone?: string;
  street?: string;
  zip?: string;
  city?: string;
};

type OrderPreview = {
  offerId: string;
  customer: OrderCustomer;
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;     // z. B. 0.19
  createdAt: number;   // ms epoch
};

type Totals = {
  monthly: { netList?: number; netOffer: number; vat: number; gross: number };
  oneTime: { netList?: number; netOffer: number; vat: number; gross: number };
  all:     { netOffer: number; vat: number; gross: number };
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value || 0);
}

export default function OrderPage() {
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("token") || ""; }
    catch { return ""; }
  }, []);

  // Signer-Eingaben
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [accept, setAccept] = useState(false);
  const [salesEmail, setSalesEmail] = useState(""); // optional CC an Vertrieb

  // Vorschau-Daten
  const [order, setOrder] = useState<OrderPreview | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);

  // Vorschau laden
  useEffect(() => {
    let abort = false;
    async function loadPreview() {
      setLoadingPreview(true);
      setError(null);
      try {
        const res = await fetch("/api/place-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preview: true, token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Vorschau konnte nicht geladen werden.");
        if (!abort) {
          setOrder(data.order as OrderPreview);
          setTotals(data.totals as Totals);
          // Convenience: Standardwerte aus Kunde übernehmen (falls vorhanden)
          if (data.order?.customer?.contact && !signerName) setSignerName(data.order.customer.contact);
          if (data.order?.customer?.email && !signerEmail) setSignerEmail(data.order.customer.email);
        }
      } catch (e: any) {
        if (!abort) setError(e?.message || String(e));
      } finally {
        if (!abort) setLoadingPreview(false);
      }
    }
    if (token) loadPreview();
    else {
      setError("Kein Token in der URL gefunden.");
      setLoadingPreview(false);
    }
    return () => { abort = true; };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      if (!accept) throw new Error("Bitte stimmen Sie den Bedingungen zu.");
      if (!signerName.trim()) throw new Error("Bitte geben Sie den Namen des Unterzeichners an.");
      if (!signerEmail.trim()) throw new Error("Bitte geben Sie die E-Mail des Unterzeichners an.");

      const res = await fetch("/api/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit: true,
          token,
          accept: true,
          signer: { name: signerName.trim(), email: signerEmail.trim() },
          salesEmail: salesEmail.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Unbekannter Fehler bei der Übermittlung.");
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  // Danke-Seite (erfolgreich)
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
            Ihre Auftragsbestätigung wurde übermittelt. Unsere Technik meldet sich in Kürze.
          </p>

          <div className="bg-gray-100 rounded-lg p-4 text-sm text-gray-700 mb-6">
            Für die technische Planung können Sie direkt einen Termin buchen:
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
            <a href="https://www.xvoice-uc.de/impressum" className="underline">Impressum & Datenschutz</a>
          </p>
        </div>
      </main>
    );
  }

  // Hauptseite
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-black text-white rounded-2xl p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x"
              alt="xVoice Logo"
              className="h-14 object-contain"
            />
            <div>
              <div className="text-sm opacity-80">Bestellbestätigung</div>
              <div className="text-xl font-semibold">xVoice UC</div>
            </div>
          </div>
          <div className="text-sm opacity-80">
            {order?.offerId ? `Angebot: ${order.offerId}` : ""}
          </div>
        </div>

        {/* Loading / Error */}
        {loadingPreview && (
          <div className="mt-6 bg-white rounded-xl shadow-sm p-6 text-gray-700">Vorschau wird geladen …</div>
        )}
        {error && !loadingPreview && (
          <div className="mt-6 bg-red-50 text-red-700 rounded-xl p-4 text-sm">{error}</div>
        )}

        {/* Inhalt */}
        {!loadingPreview && order && totals && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Kundendaten */}
            <section className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900">Kundendaten</h2>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div><span className="text-gray-500">Firma:</span> <span className="font-medium">{order.customer.company || "—"}</span></div>
                <div><span className="text-gray-500">Ansprechpartner:</span> <span className="font-medium">{order.customer.contact || "—"}</span></div>
                <div><span className="text-gray-500">E-Mail:</span> <span className="font-medium">{order.customer.email || "—"}</span></div>
                <div><span className="text-gray-500">Telefon:</span> <span className="font-medium">{order.customer.phone || "—"}</span></div>
                <div className="sm:col-span-2">
                  <span className="text-gray-500">Adresse:</span>{" "}
                  <span className="font-medium">
                    {[order.customer.street, [order.customer.zip, order.customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}
                  </span>
                </div>
              </div>

              {/* Zusammenfassung monatlich */}
              <h3 className="text-base font-semibold mt-8 mb-3 text-gray-900">Monatliche Positionen</h3>
              {order.monthlyRows.length === 0 ? (
                <div className="text-sm text-gray-600">Keine monatlichen Positionen.</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left p-3">Position</th>
                        <th className="text-left p-3">Menge</th>
                        <th className="text-left p-3">Einzelpreis</th>
                        <th className="text-left p-3">Summe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.monthlyRows.map((r) => (
                        <tr key={`m-${r.sku}`} className="border-t">
                          <td className="p-3">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-gray-500">{r.sku}{r.desc ? ` · ${r.desc}` : ""}</div>
                          </td>
                          <td className="p-3">{r.quantity}</td>
                          <td className="p-3">{formatMoney(r.unit)}</td>
                          <td className="p-3 font-medium">{formatMoney(r.total)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50">
                        <td className="p-3" />
                        <td className="p-3" />
                        <td className="p-3 text-right">Zwischensumme (netto)</td>
                        <td className="p-3 font-semibold">{formatMoney(totals.monthly.netOffer)}</td>
                      </tr>
                      <tr>
                        <td className="p-3" />
                        <td className="p-3" />
                        <td className="p-3 text-right">zzgl. USt. ({Math.round(order.vatRate * 100)}%)</td>
                        <td className="p-3 font-semibold">{formatMoney(totals.monthly.vat)}</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="p-3" />
                        <td className="p-3" />
                        <td className="p-3 text-right font-semibold">Bruttosumme</td>
                        <td className="p-3 font-semibold">{formatMoney(totals.monthly.gross)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Zusammenfassung einmalig */}
              <h3 className="text-base font-semibold mt-8 mb-3 text-gray-900">Einmalige Positionen</h3>
              {order.oneTimeRows.length === 0 ? (
                <div className="text-sm text-gray-600">Keine einmaligen Positionen.</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left p-3">Position</th>
                        <th className="text-left p-3">Menge</th>
                        <th className="text-left p-3">Einzelpreis</th>
                        <th className="text-left p-3">Summe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.oneTimeRows.map((r) => (
                        <tr key={`o-${r.sku}`} className="border-t">
                          <td className="p-3">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-gray-500">{r.sku}{r.desc ? ` · ${r.desc}` : ""}</div>
                          </td>
                          <td className="p-3">{r.quantity}</td>
                          <td className="p-3">{formatMoney(r.unit)}</td>
                          <td className="p-3 font-medium">{formatMoney(r.total)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50">
                        <td className="p-3" />
                        <td className="p-3" />
                        <td className="p-3 text-right">Zwischensumme (netto)</td>
                        <td className="p-3 font-semibold">{formatMoney(totals.oneTime.netOffer)}</td>
                      </tr>
                      <tr>
                        <td className="p-3" />
                        <td className="p-3" />
                        <td className="p-3 text-right">zzgl. USt. ({Math.round(order.vatRate * 100)}%)</td>
                        <td className="p-3 font-semibold">{formatMoney(totals.oneTime.vat)}</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td className="p-3" />
                        <td className="p-3" />
                        <td className="p-3 text-right font-semibold">Bruttosumme</td>
                        <td className="p-3 font-semibold">{formatMoney(totals.oneTime.gross)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Abschluss-Panel */}
            <aside className="bg-white rounded-xl shadow-sm p-6 h-max">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Bestellung abschließen</h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Unterzeichner – Name</label>
                  <input
                    className="w-full border rounded-md px-3 h-10 text-sm"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    placeholder="Max Mustermann"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Unterzeichner – E-Mail</label>
                  <input
                    type="email"
                    className="w-full border rounded-md px-3 h-10 text-sm"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                    placeholder="max.mustermann@firma.de"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Vertrieb (optional, Kopie an)</label>
                  <input
                    type="email"
                    className="w-full border rounded-md px-3 h-10 text-sm"
                    value={salesEmail}
                    onChange={(e) => setSalesEmail(e.target.value)}
                    placeholder="vertrieb@xvoice-uc.de"
                  />
                </div>

                {/* Gesamtsummen */}
                <div className="mt-4 rounded-lg border p-3 text-sm bg-gray-50">
                  <div className="flex justify-between">
                    <span>Gesamtsumme netto</span>
                    <strong>{formatMoney((totals.monthly.netOffer || 0) + (totals.oneTime.netOffer || 0))}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>zzgl. USt.</span>
                    <strong>{formatMoney((totals.monthly.vat || 0) + (totals.oneTime.vat || 0))}</strong>
                  </div>
                  <div className="flex justify-between text-base mt-1">
                    <span className="font-semibold">Gesamtsumme brutto</span>
                    <span className="font-semibold">
                      {formatMoney(((totals.monthly.gross || 0) + (totals.oneTime.gross || 0)))}
                    </span>
                  </div>
                </div>

                <label className="flex items-start gap-3 mt-3 text-sm">
                  <input
                    type="checkbox"
                    checked={accept}
                    onChange={(e) => setAccept(e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-gray-700">
                    Ich bestätige die oben aufgeführten Positionen sowie die Preise und stimme den{" "}
                    <a href="https://www.xvoice-uc.de/agb" className="underline" target="_blank" rel="noopener noreferrer">AGB</a>{" "}
                    und der{" "}
                    <a href="https://www.xvoice-uc.de/datenschutz" className="underline" target="_blank" rel="noopener noreferrer">
                      Datenschutzerklärung
                    </a>{" "}
                    zu.
                  </span>
                </label>

                {error && (
                  <div className="bg-red-50 text-red-700 rounded-md px-3 py-2 text-sm">{error}</div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-[#ff4e00] text-white font-semibold py-3 rounded-lg hover:bg-[#e24400] transition-colors disabled:opacity-60"
                >
                  {loading ? "Wird übermittelt …" : "Jetzt verbindlich bestellen"}
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-6 text-center">
                © {new Date().getFullYear()} xVoice UC UG (haftungsbeschränkt) · Peter-Müller-Straße 3, 40468 Düsseldorf ·{" "}
                <a href="https://www.xvoice-uc.de/impressum" className="underline">Impressum & Datenschutz</a>
              </p>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
