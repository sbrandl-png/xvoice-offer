// app/order/page.tsx
import { verifyOrderToken, type OrderPayload, type OrderRow } from "@/lib/orderToken";

function fmtMoney(v: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(v);
}

function Section({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="rounded-xl border border-zinc-200 p-4 bg-white">
        {children}
      </div>
    </section>
  );
}

/** Lokaler Hilfstyp: Rows dürfen optional eine Beschreibung enthalten */
type RowMaybeDesc = OrderRow & { desc?: string };

function RowsTable({ rows }: { rows: RowMaybeDesc[] }) {
  if (!rows?.length) {
    return <div className="text-sm text-zinc-500">Keine Positionen.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Position</th>
            <th className="py-2 pr-4">Menge</th>
            <th className="py-2 pr-4">Einzelpreis</th>
            <th className="py-2 pr-0 text-right">Summe</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const hasDiscount = r.offerUnit < r.listUnit - 1e-9;
            const badgePct = hasDiscount
              ? Math.max(0, Math.round((1 - r.offerUnit / r.listUnit) * 100))
              : 0;

            return (
              <tr key={`${r.sku}`} className="border-b last:border-b-0">
                <td className="py-2 pr-4 align-top">
                  <div className="font-medium">{r.name}</div>
                  {r.desc ? (
                    <div className="text-xs text-zinc-500">{r.desc}</div>
                  ) : null}
                  <div className="text-xs text-zinc-500">{r.sku}</div>
                </td>

                <td className="py-2 pr-4 align-top">{r.quantity}</td>

                <td className="py-2 pr-4 align-top">
                  {hasDiscount ? (
                    <div className="space-x-2">
                      <span className="line-through opacity-60">
                        {fmtMoney(r.listUnit)}
                      </span>
                      <span className="font-semibold text-orange-600">
                        {fmtMoney(r.offerUnit)}
                      </span>
                      {badgePct > 0 ? (
                        <span className="inline-block text-[11px] px-2 py-[2px] rounded-full text-white bg-orange-600 align-middle">
                          -{badgePct}%
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span>{fmtMoney(r.offerUnit)}</span>
                  )}
                </td>

                <td className="py-2 pr-0 align-top text-right">
                  {r.offerTotal !== r.listTotal ? (
                    <div className="space-x-2">
                      <span className="line-through opacity-60">
                        {fmtMoney(r.listTotal)}
                      </span>
                      <span className="font-semibold">
                        {fmtMoney(r.offerTotal)}
                      </span>
                    </div>
                  ) : (
                    <span className="font-semibold">
                      {fmtMoney(r.offerTotal)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


function Totals({
  rows,
  vatRate,
  title,
}: {
  rows: RowMaybeDesc[];
  vatRate: number;
  title: string;
}) {
  const listSubtotal = rows.reduce((a, r) => a + r.listTotal, 0);
  const offerSubtotal = rows.reduce((a, r) => a + r.offerTotal, 0);
  const discount = Math.max(0, listSubtotal - offerSubtotal);
  const vat = offerSubtotal * vatRate;
  const gross = offerSubtotal + vat;

  const Row = ({
    label,
    value,
    strong,
  }: {
    label: string;
    value: string;
    strong?: boolean;
  }) => (
    <div className="grid grid-cols-[1fr_auto] gap-x-8 items-baseline">
      <div className={strong ? "font-semibold" : ""}>{label}</div>
      <div className={`text-right tabular-nums ${strong ? "font-semibold" : ""}`}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="rounded-lg bg-zinc-50 p-3 space-y-1">
      <div className="text-sm font-medium mb-1">{title}</div>
      <Row label="Listen-Zwischensumme (netto)" value={fmtMoney(listSubtotal)} />
      {discount > 0 && (
        <Row label="Rabatt gesamt" value={"−" + fmtMoney(discount)} />
      )}
      <Row
        label={discount > 0 ? "Zwischensumme nach Rabatt" : "Zwischensumme (netto)"}
        value={fmtMoney(offerSubtotal)}
      />
      <Row label={`zzgl. USt. (${Math.round(vatRate * 100)}%)`} value={fmtMoney(vat)} />
      <Row label="Bruttosumme" value={fmtMoney(gross)} strong />
    </div>
  );
}

export default function OrderPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams?.token ?? "";
  const verified = verifyOrderToken(token);

  if (!verified.ok) {
    return (
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-3">Bestell-Link ungültig</h1>
        <p className="text-sm text-red-600">Fehler: {verified.error}</p>
        <p className="text-sm mt-3 text-zinc-600">
          Bitte wenden Sie sich an unser Vertriebsteam:{" "}
          <a className="underline" href="mailto:vertrieb@xvoice-uc.de">
            vertrieb@xvoice-uc.de
          </a>
          .
        </p>
      </main>
    );
  }

  const payload: OrderPayload = verified.payload;
  const { customer, monthlyRows, oneTimeRows, vatRate, offerId } = payload;

  const monthlyList: RowMaybeDesc[] = monthlyRows ?? [];
  const oneTimeList: RowMaybeDesc[] = oneTimeRows ?? [];

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between rounded-2xl p-5 border bg-black text-white">
        <div className="flex items-center gap-4">
          <img
            src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x"
            alt="xVoice Logo"
            className="h-14 w-14 object-contain"
          />
          <div>
            <div className="text-lg font-semibold">xVoice UC – Bestellung</div>
            <div className="text-sm opacity-80">Angebots-ID: {offerId}</div>
          </div>
        </div>
        <div className="text-sm text-right opacity-80">
          Stand {new Date().toISOString().slice(0, 10)}
        </div>
      </header>

      <Section title="Kundendaten">
        <div className="text-sm">
          <div className="font-medium">{customer.company || "—"}</div>
          <div>{customer.contact || "—"}</div>
          <div className="text-zinc-600">
            {customer.street || "—"}
            {customer.zip || customer.city ? (
              <>
                <br />
                {[customer.zip, customer.city].filter(Boolean).join(" ")}
              </>
            ) : null}
          </div>
          <div className="text-zinc-600">
            {customer.email || "—"}
            {customer.phone ? ` · ${customer.phone}` : ""}
          </div>
        </div>
      </Section>

      <Section title="Monatliche Positionen">
        <RowsTable rows={monthlyList} />
        <div className="mt-4">
          <Totals rows={monthlyList} vatRate={vatRate} title="Summe (monatlich)" />
        </div>
      </Section>

      <Section title="Einmalige Positionen">
        <RowsTable rows={oneTimeList} />
        <div className="mt-4">
          <Totals rows={oneTimeList} vatRate={vatRate} title="Summe (einmalig)" />
        </div>
      </Section>

      {/* Bestellformular (klassischer POST) */}
      <Section title="Verbindliche Bestellung">
        <form method="post" action="/api/place-order" className="space-y-3">
          {/* Token für die API */}
          <input type="hidden" name="token" value={token} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="agb" required className="mt-[3px]" />
            <span>
              Ich bestätige die verbindliche Bestellung zu den oben
              aufgeführten Konditionen. Mir ist bekannt, dass die Preise netto
              zzgl. gesetzlicher USt. gelten.
            </span>
          </label>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 rounded-lg font-semibold bg-orange-600 text-white"
            >
              Verbindlich bestellen
            </button>
            <a
              href="mailto:vertrieb@xvoice-uc.de?subject=Frage%20zur%20Bestellung"
              className="inline-flex items-center px-4 py-2 rounded-lg font-semibold border"
            >
              Rückfrage per E-Mail
            </a>
          </div>

          <p className="text-xs text-zinc-500">
            Hinweis: Mit Klick auf „Verbindlich bestellen“ wird die Bestellung
            an xVoice UC übermittelt. Sie erhalten eine Auftragsbestätigung
            per E-Mail.
          </p>
        </form>
      </Section>

      <footer className="text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} xVoice UC – Alle Angaben ohne Gewähr
      </footer>
    </main>
  );
}
