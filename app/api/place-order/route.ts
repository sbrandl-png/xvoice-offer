/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs"; // wichtig: kein Edge, damit Buffer & Node-APIs verfügbar sind

// ---------- Typen ----------
type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  unit: number;   // Netto Einzelpreis
  total: number;  // Netto Zeilensumme (netto)
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
  vatRate: number; // z.B. 0.19
  createdAt?: number;
};

// ---------- Utils ----------
const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const euro = (n: number) => EUR.format(Number.isFinite(n) ? n : 0);

function decodeTokenUnsafe(token: string): any | null {
  try {
    // JWT-kompatibel (Header.Payload.Signature) oder reines Base64-JSON
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
  const vatRate: number =
    typeof input.vatRate === "number" ? input.vatRate :
    typeof input.vat === "number" ? input.vat : NaN;

  const offerId = input.offerId;

  if (
    typeof offerId !== "string" ||
    !offerId.trim() ||
    !Array.isArray(monthlyRows) ||
    !Array.isArray(oneTimeRows) ||
    !Number.isFinite(vatRate)
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
  const netMonthly = order.monthlyRows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const netOneTime = order.oneTimeRows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const vatMonthly = netMonthly * order.vatRate;
  const vatOneTime = netOneTime * order.vatRate;
  const grossMonthly = netMonthly + vatMonthly;
  const grossOneTime = netOneTime + vatOneTime;
  return { netMonthly, netOneTime, vatMonthly, vatOneTime, grossMonthly, grossOneTime };
}

function renderRows(rows: OrderRow[]) {
  if (!rows?.length) {
    return `<tr><td colspan="5" style="padding:8px 12px;color:#6b7280;font-size:12px;border-top:1px solid #eee;">Keine Positionen</td></tr>`;
  }
  return rows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 12px;border-top:1px solid #eee;">${r.sku || ""}</td>
        <td style="padding:8px 12px;border-top:1px solid #eee;">${r.name || ""}</td>
        <td style="padding:8px 12px;border-top:1px solid #eee;text-align:right;">${Number(r.quantity) || 0}</td>
        <td style="padding:8px 12px;border-top:1px solid #eee;text-align:right;">${euro(Number(r.unit) || 0)}</td>
        <td style="padding:8px 12px;border-top:1px solid #eee;text-align:right;font-weight:600;">${euro(Number(r.total) || 0)}</td>
      </tr>`
    )
    .join("");
}

function emailHtml(order: OrderPayload, signer?: { name?: string; email?: string }) {
  const c = order.customer ?? {};
  const { netMonthly, netOneTime, vatMonthly, vatOneTime, grossMonthly, grossOneTime } = calcTotals(order);

  return `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.5;color:#111">
    <div style="text-align:center;margin-bottom:16px;">
      <img src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x" alt="xVoice Logo" style="height:48px"/>
    </div>
    <h2 style="margin:0 0 8px;">Auftragsbestätigung – Angebot ${order.offerId}</h2>
    <p style="margin:0 0 16px;">Vielen Dank für Ihre Bestellung. Wir starten nun mit der Bereitstellung Ihrer xVoice UC Lösung.</p>

    <h3 style="margin:24px 0 8px;font-size:14px;">Kundendaten</h3>
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:13px;">
      <div><span style="color:#6b7280">Firma:</span> <strong>${c.company || "–"}</strong></div>
      <div><span style="color:#6b7280">Kontakt:</span> <strong>${c.contact || "–"}</strong></div>
      <div><span style="color:#6b7280">E-Mail:</span> <strong>${c.email || "–"}</strong></div>
      <div><span style="color:#6b7280">Telefon:</span> <strong>${c.phone || "–"}</strong></div>
      <div><span style="color:#6b7280">Adresse:</span> <strong>${[c.street, c.zip, c.city].filter(Boolean).join(", ") || "–"}</strong></div>
    </div>

    <h3 style="margin:24px 0 8px;font-size:14px;">Zusammenfassung</h3>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;flex:1;min-width:240px;">
        <div style="font-weight:600;margin-bottom:8px;">Monatlich</div>
        <div style="font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><span>Netto</span><span>${euro(netMonthly)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>USt (${(order.vatRate * 100).toFixed(0)}%)</span><span>${euro(vatMonthly)}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:600;"><span>Brutto</span><span>${euro(grossMonthly)}</span></div>
        </div>
      </div>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;flex:1;min-width:240px;">
        <div style="font-weight:600;margin-bottom:8px;">Einmalig</div>
        <div style="font-size:13px;">
          <div style="display:flex;justify-content:space-between;"><span>Netto</span><span>${euro(netOneTime)}</span></div>
          <div style="display:flex;justify-content:space-between;"><span>USt (${(order.vatRate * 100).toFixed(0)}%)</span><span>${euro(vatOneTime)}</span></div>
          <div style="display:flex;justify-content:space-between;font-weight:600;"><span>Brutto</span><span>${euro(grossOneTime)}</span></div>
        </div>
      </div>
    </div>

    <h3 style="margin:24px 0 8px;font-size:14px;">Monatliche Positionen</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="text-align:left;padding:8px 12px;">SKU</th>
          <th style="text-align:left;padding:8px 12px;">Bezeichnung</th>
          <th style="text-align:right;padding:8px 12px;">Menge</th>
          <th style="text-align:right;padding:8px 12px;">Einzelpreis (netto)</th>
          <th style="text-align:right;padding:8px 12px;">Summe (netto)</th>
        </tr>
      </thead>
      <tbody>${renderRows(order.monthlyRows)}</tbody>
    </table>

    <h3 style="margin:24px 0 8px;font-size:14px;">Einmalige Positionen</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="text-align:left;padding:8px 12px;">SKU</th>
          <th style="text-align:left;padding:8px 12px;">Bezeichnung</th>
          <th style="text-align:right;padding:8px 12px;">Menge</th>
          <th style="text-align:right;padding:8px 12px;">Einzelpreis (netto)</th>
          <th style="text-align:right;padding:8px 12px;">Summe (netto)</th>
        </tr>
      </thead>
      <tbody>${renderRows(order.oneTimeRows)}</tbody>
    </table>

    ${
      signer?.name || signer?.email
        ? `<p style="margin-top:16px;font-size:12px;color:#6b7280;">Unterzeichner: <strong>${signer?.name || "—"}</strong> · ${signer?.email || "—"}</p>`
        : ""
    }

    <div style="margin-top:24px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#6b7280;">
      Bei Fragen zur Konfiguration können Sie hier direkt das Kick-off-Gespräch buchen:
      <br/>
      <a href="https://calendly.com/s-brandl-xvoice-uc/xvoice-uc-kickoff-meeting" style="color:#ff4e00;">Kick-off-Gespräch buchen</a>
    </div>

    <p style="margin-top:24px;font-size:11px;color:#6b7280;">
      © ${new Date().getFullYear()} xVoice UC UG (haftungsbeschränkt) · Peter-Müller-Straße 3, 40468 Düsseldorf ·
      <a href="https://www.xvoice-uc.de/impressum" style="color:#6b7280;">Impressum & Datenschutz</a>
    </p>
  </div>`;
}

function emailText(order: OrderPayload) {
  const c = order.customer ?? {};
  const { netMonthly, netOneTime, grossMonthly, grossOneTime } = calcTotals(order);
  return [
    `Auftragsbestätigung – Angebot ${order.offerId}`,
    ``,
    `Kunde: ${c.company || "-"} / Kontakt: ${c.contact || "-"} / E-Mail: ${c.email || "-"}`,
    `Adresse: ${[c.street, c.zip, c.city].filter(Boolean).join(", ") || "-"}`,
    ``,
    `Monatlich (netto/brutto): ${EUR.format(netMonthly)} / ${EUR.format(grossMonthly)}`,
    `Einmalig (netto/brutto): ${EUR.format(netOneTime)} / ${EUR.format(grossOneTime)}`,
  ].join("\n");
}

// ---------- Handler ----------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { submit, token, signer, salesEmail } = body || {};

    if (submit !== true) {
      return NextResponse.json({ ok: false, error: "submit==true erforderlich." }, { status: 400 });
    }
    if (typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ ok: false, error: "Fehlender Token." }, { status: 400 });
    }

    // Token lesen & normalisieren (unterstützt Aliasse)
    const decoded = decodeTokenUnsafe(token);
    const rawOrder = decoded?.order ?? decoded ?? null;
    const order = normalizeOrder(rawOrder);

    if (!order) {
      return NextResponse.json({
        ok: false,
        error:
          "Orderdaten unvollständig/ungültig: offerId, monthlyRows (oder Alias monthly/recurring), oneTimeRows (oder Alias oneTime/setup), vatRate (oder Alias vat)",
      }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY || "");
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ ok: false, error: "RESEND_API_KEY fehlt." }, { status: 500 });
    }

    const fromEmail = process.env.FROM_EMAIL || "xVoice UC <no-reply@xvoice-uc.de>";
    const recipients = new Set<string>();

    // Kunde
    if (order.customer?.email) recipients.add(order.customer.email);
    // Unterzeichner (optional)
    if (signer?.email) recipients.add(String(signer.email));
    // Sales optional
    if (salesEmail) recipients.add(String(salesEmail));
    // Falls niemand angegeben, wenigstens die Vertriebsadresse als TO
    if (recipients.size === 0) recipients.add("vertrieb@xvoice-uc.de");

    const to = Array.from(recipients);
    const bcc = ["vertrieb@xvoice-uc.de"]; // immer in BCC

    const subject = `Auftragsbestätigung – Angebot ${order.offerId}`;

    const html = emailHtml(order, signer);
    const text = emailText(order);

    // E-Mail senden
    const sendResult = await resend.emails.send({
      from: fromEmail,
      to,
      bcc,
      subject,
      html,
      text,
    });

    // Resend gibt bei Fehlern eine error-Property zurück
    if ((sendResult as any)?.error) {
      return NextResponse.json({ ok: false, error: (sendResult as any).error?.message || "Resend Fehler." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
