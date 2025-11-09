// app/order/page.tsx
import { verifyOrderToken, type OrderPayload } from "@/lib/orderToken";
import { redirect } from "next/navigation";

function fmt(num: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
}

export const dynamic = "force-dynamic";

export default async function OrderPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams?.token;
  if (!token) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">Fehler</h1>
        <p>Bestelllink ist ungültig oder fehlt.</p>
      </main>
    );
  }

  let payload: OrderPayload;
  try {
    payload = verifyOrderToken(token);
  } catch {
    return (
      <main className="max-w-xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">Fehler</h1>
        <p>Der Bestelllink ist abgelaufen oder ungültig.</p>
      </main>
    );
  }

  const netMonthly = payload.monthlyRows.reduce((a, r) => a + r.total, 0);
  const netOne = payload.oneTimeRows.reduce((a, r) => a + r.total, 0);
  const vatMonthly = netMonthly * payload.vatRate;
  const vatOne = netOne * payload.vatRate;
  const grossMonthly = netMonthly + vatMonthly;
  const grossOne = netOne + vatOne;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <img src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x" alt="xVoice Logo" className="h-14" />
        <div className="text-sm text-gray-500">Angebot-ID: {payload.offerId}</div>
      </header>

      <h1 className="text-2xl font-semibold">Verbindliche Bestellung</h1>
      <p className="text-gray-700">
        Bitte prüfen Sie die Daten und bestätigen Sie die Bestellung. Sie erhalten im Anschluss automatisch die Auftragsbestätigung und ein unterschriftsfertiges Dokument.
      </p>

      {/* Angebotsübersicht */}
      <section className="space-y-3">
        <h2 className="font-semibold">Monatliche Positionen</h2>
        {payload.monthlyRows.length === 0 ? (
          <div className="text-sm text-gray-600">Keine monatlichen Positionen.</div>
        ) : (
          <table className="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-gray-500">
                <th>Position</th><th>Menge</th><th>Einzelpreis</th><th className="text-right">Summe</th>
              </tr>
            </thead>
            <tbody>
              {payload.monthlyRows.map((r) => (
                <tr key={"m-"+r.sku} className="bg-gray-50">
                  <td className="px-2 py-1">{r.name} <span className="text-gray-500">({r.sku})</span></td>
                  <td className="px-2 py-1">{r.quantity}</td>
                  <td className="px-2 py-1">{fmt(r.unit)}</td>
                  <td className="px-2 py-1 text-right">{fmt(r.total)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="px-2 py-1 text-right text-gray-600">Zwischensumme (netto)</td>
                <td className="px-2 py-1 text-right font-medium">{fmt(netMonthly)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2 py-1 text-right text-gray-600">zzgl. USt.</td>
                <td className="px-2 py-1 text-right font-medium">{fmt(vatMonthly)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2 py-1 text-right font-semibold">Bruttosumme</td>
                <td className="px-2 py-1 text-right font-semibold">{fmt(grossMonthly)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Einmalige Positionen</h2>
        {payload.oneTimeRows.length === 0 ? (
          <div className="text-sm text-gray-600">Keine einmaligen Positionen.</div>
        ) : (
          <table className="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr className="text-left text-gray-500">
                <th>Position</th><th>Menge</th><th>Einzelpreis</th><th className="text-right">Summe</th>
              </tr>
            </thead>
            <tbody>
              {payload.oneTimeRows.map((r) => (
                <tr key={"o-"+r.sku} className="bg-gray-50">
                  <td className="px-2 py-1">{r.name} <span className="text-gray-500">({r.sku})</span></td>
                  <td className="px-2 py-1">{r.quantity}</td>
                  <td className="px-2 py-1">{fmt(r.unit)}</td>
                  <td className="px-2 py-1 text-right">{fmt(r.total)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="px-2 py-1 text-right text-gray-600">Zwischensumme (netto)</td>
                <td className="px-2 py-1 text-right font-medium">{fmt(netOne)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2 py-1 text-right text-gray-600">zzgl. USt.</td>
                <td className="px-2 py-1 text-right font-medium">{fmt(vatOne)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-2 py-1 text-right font-semibold">Bruttosumme</td>
                <td className="px-2 py-1 text-right font-semibold">{fmt(grossOne)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Bestellformular -> POST an /api/place-order */}
      <form method="post" action="/api/place-order" className="space-y-3">
        {/* Sichtbare Felder (vorgefüllt, aber editierbar) */}
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-sm">
            Firma
            <input name="company" defaultValue={payload.customer.company || ""} required className="w-full border rounded px-3 py-2" />
          </label>
          <label className="text-sm">
            Ansprechpartner
            <input name="contact" defaultValue={payload.customer.contact || ""} required className="w-full border rounded px-3 py-2" />
          </label>
          <label className="text-sm">
            E-Mail
            <input name="email" type="email" defaultValue={payload.customer.email || ""} required className="w-full border rounded px-3 py-2" />
          </label>
          <label className="text-sm">
            Telefon
            <input name="phone" defaultValue={payload.customer.phone || ""} className="w-full border rounded px-3 py-2" />
          </label>
        </div>

        {/* Pflicht-Checkbox */}
        <label className="text-sm flex items-start gap-2">
          <input type="checkbox" name="accept" required className="mt-1" />
          <span>
            Ich bestätige die <strong>verbindliche Bestellung</strong> zu den oben aufgeführten Konditionen.
            Die Allgemeinen Geschäftsbedingungen der xVoice UC habe ich zur Kenntnis genommen.
          </span>
        </label>

        {/* Versteckte Daten (damit die API alles hat) */}
        <input type="hidden" name="token" value={token} />

        <button
          type="submit"
          className="inline-block bg-[#ff4e00] text-white px-5 py-3 rounded-lg font-semibold"
        >
          Verbindlich bestellen
        </button>
      </form>

      <p className="text-xs text-gray-500">
        © {new Date().getFullYear()} xVoice UC · Peter-Müller-Straße 3, 40468 Düsseldorf · Amtsgericht Siegburg, HRB 19078
      </p>
    </main>
  );
}
