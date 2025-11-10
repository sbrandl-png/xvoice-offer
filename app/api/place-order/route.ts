// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";

type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  unit: number;   // Netto-Einzelpreis lt. Angebot
  total: number;  // Netto-Zeilenpreis lt. Angebot
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

type OrderPayload = {
  offerId: string;
  customer: OrderCustomer;
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;     // z. B. 0.19
  createdAt: number;   // ms epoch
  // exp?: number;     // optional; wird NICHT vorausgesetzt
};

type PreviewBody = { preview: true; token: string };
type SubmitBody = {
  submit: true;
  token: string;
  accept: boolean;
  signer: { name: string; email: string };
  salesEmail?: string;
};
type Body = PreviewBody | SubmitBody;

function apiError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// sehr einfache JWT-Decode-Funktion ohne Signaturprüfung (für Preview/Submit ausreichend).
function decodeJwt<T = any>(token: string): T | null {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function isOrderPayload(p: any): p is OrderPayload {
  return (
    p &&
    typeof p.offerId === "string" &&
    p.customer &&
    Array.isArray(p.monthlyRows) &&
    Array.isArray(p.oneTimeRows) &&
    typeof p.vatRate === "number"
  );
}

function sumRows(rows: OrderRow[]) {
  const net = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  return net;
}

function computeTotals(order: OrderPayload) {
  const netMonthly = sumRows(order.monthlyRows);
  const netOneTime = sumRows(order.oneTimeRows);
  const vatMonthly = netMonthly * order.vatRate;
  const vatOneTime = netOneTime * order.vatRate;
  return {
    monthly: {
      netOffer: round2(netMonthly),
      vat: round2(vatMonthly),
      gross: round2(netMonthly + vatMonthly),
    },
    oneTime: {
      netOffer: round2(netOneTime),
      vat: round2(vatOneTime),
      gross: round2(netOneTime + vatOneTime),
    },
    all: {
      netOffer: round2(netMonthly + netOneTime),
      vat: round2(vatMonthly + vatOneTime),
      gross: round2(netMonthly + netOneTime + vatMonthly + vatOneTime),
    },
  };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function eur(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
}

// optional: Resend für Mailversand
async function sendMail(opts: { to: string[]; subject: string; html: string; from?: string }) {
  const { RESEND_API_KEY, MAIL_FROM } = process.env as Record<string, string | undefined>;

  // Fallback: loggen statt senden
  if (!RESEND_API_KEY) {
    console.log("[MAIL:FAKE-SEND]", { ...opts, note: "RESEND_API_KEY fehlt – Mail nur geloggt." });
    return;
  }

  const from = opts.from || MAIL_FROM || "xVoice Orders <no-reply@xvoice-uc.de>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error("[MAIL:ERROR]", res.status, txt);
    // wir werfen hier NICHT, damit der Auftrag trotzdem ok:true zurückgibt
  }
}

function renderMailHTML(args: {
  headline: string;
  intro: string;
  order: OrderPayload;
}) {
  const { order, headline, intro } = args;
  const totals = computeTotals(order);

  const rowsToHtml = (rows: OrderRow[]) =>
    rows
      .map(
        (r) => `
        <tr>
          <td style="padding:8px 12px;border-top:1px solid #eee;">
            <div style="font-weight:600;">${escapeHtml(r.name)}</div>
            <div style="font-size:12px;color:#666">${escapeHtml(r.sku)}${r.desc ? " · " + escapeHtml(r.desc) : ""}</div>
          </td>
          <td style="padding:8px 12px;border-top:1px solid #eee;">${r.quantity}</td>
          <td style="padding:8px 12px;border-top:1px solid #eee;">${eur(r.unit)}</td>
          <td style="padding:8px 12px;border-top:1px solid #eee;font-weight:600">${eur(r.total)}</td>
        </tr>`
      )
      .join("");

  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#f6f7f9;padding:24px;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden">
      <tr>
        <td style="background:#000;padding:20px 24px;display:flex;align-items:center;gap:12px;">
          <img src="https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x" height="28" alt="xVoice" />
          <div style="color:#fff;font-size:18px;font-weight:600;">${escapeHtml(headline)}</div>
          <div style="margin-left:auto;color:#bbb;font-size:12px;">Angebot: ${escapeHtml(order.offerId)}</div>
        </td>
      </tr>
      <tr><td style="padding:20px 24px;font-size:14px;line-height:1.6">${escapeHtml(intro)}</td></tr>

      <tr><td style="padding:4px 24px 0;font-size:16px;font-weight:700">Kundendaten</td></tr>
      <tr>
        <td style="padding:8px 24px 16px;font-size:13px;color:#333">
          <div><b>Firma:</b> ${escapeHtml(order.customer.company || "—")}</div>
          <div><b>Ansprechpartner:</b> ${escapeHtml(order.customer.contact || "—")}</div>
          <div><b>E-Mail:</b> ${escapeHtml(order.customer.email || "—")}</div>
          <div><b>Telefon:</b> ${escapeHtml(order.customer.phone || "—")}</div>
          <div><b>Adresse:</b> ${escapeHtml(
            [order.customer.street, [order.customer.zip, order.customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"
          )}</div>
        </td>
      </tr>

      <tr><td style="padding:4px 24px 0;font-size:16px;font-weight:700">Monatliche Positionen</td></tr>
      <tr>
        <td style="padding:8px 24px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#333">
            <thead>
              <tr>
                <th align="left" style="padding:8px 12px;color:#666">Position</th>
                <th align="left" style="padding:8px 12px;color:#666">Menge</th>
                <th align="left" style="padding:8px 12px;color:#666">Einzelpreis</th>
                <th align="left" style="padding:8px 12px;color:#666">Summe</th>
              </tr>
            </thead>
            <tbody>
              ${rowsToHtml(order.monthlyRows)}
              <tr><td></td><td></td><td style="padding:8px 12px;text-align:right">Zwischensumme (netto)</td><td style="padding:8px 12px;font-weight:700">${eur(totals.monthly.netOffer)}</td></tr>
              <tr><td></td><td></td><td style="padding:8px 12px;text-align:right">zzgl. USt. (${Math.round(order.vatRate*100)}%)</td><td style="padding:8px 12px;font-weight:700">${eur(totals.monthly.vat)}</td></tr>
              <tr><td></td><td></td><td style="padding:8px 12px;text-align:right"><b>Bruttosumme</b></td><td style="padding:8px 12px;font-weight:700">${eur(totals.monthly.gross)}</td></tr>
            </tbody>
          </table>
        </td>
      </tr>

      <tr><td style="padding:4px 24px 0;font-size:16px;font-weight:700">Einmalige Positionen</td></tr>
      <tr>
        <td style="padding:8px 24px 16px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;color:#333">
            <thead>
              <tr>
                <th align="left" style="padding:8px 12px;color:#666">Position</th>
                <th align="left" style="padding:8px 12px;color:#666">Menge</th>
                <th align="left" style="padding:8px 12px;color:#666">Einzelpreis</th>
                <th align="left" style="padding:8px 12px;color:#666">Summe</th>
              </tr>
            </thead>
            <tbody>
              ${rowsToHtml(order.oneTimeRows)}
              <tr><td></td><td></td><td style="padding:8px 12px;text-align:right">Zwischensumme (netto)</td><td style="padding:8px 12px;font-weight:700">${eur(totals.oneTime.netOffer)}</td></tr>
              <tr><td></td><td></td><td style="padding:8px 12px;text-align:right">zzgl. USt. (${Math.round(order.vatRate*100)}%)</td><td style="padding:8px 12px;font-weight:700">${eur(totals.oneTime.vat)}</td></tr>
              <tr><td></td><td></td><td style="padding:8px 12px;text-align:right"><b>Bruttosumme</b></td><td style="padding:8px 12px;font-weight:700">${eur(totals.oneTime.gross)}</td></tr>
            </tbody>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:12px 24px 24px">
          <div style="border-top:1px solid #eee;padding-top:12px;font-size:14px">
            <div><b>Gesamtsumme netto:</b> ${eur(totals.all.netOffer)}</div>
            <div><b>zzgl. USt.:</b> ${eur(totals.all.vat)}</div>
            <div style="font-size:16px;margin-top:6px;"><b>Gesamtsumme brutto:</b> ${eur(totals.all.gross)}</div>
          </div>
          <div style="margin-top:18px;font-size:12px;color:#666">
            © ${new Date().getFullYear()} xVoice UC UG (haftungsbeschränkt) · Peter-Müller-Straße 3, 40468 Düsseldorf ·
            <a href="https://www.xvoice-uc.de/impressum">Impressum & Datenschutz</a>
          </div>
        </td>
      </tr>
    </table>
  </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Body fehlt oder ist kein JSON.");
  }

  // Prüfe Preview/Submit-Formate
  const isPreview = !!body?.preview && typeof body.token === "string";
  const isSubmit =
    !!body?.submit &&
    typeof body.token === "string" &&
    typeof body.accept === "boolean" &&
    body.signer &&
    typeof body.signer.name === "string" &&
    typeof body.signer.email === "string";

  if (!isPreview && !isSubmit) {
    return apiError(400, "Unsupported payload.");
  }

  // Token decoden
  const decoded = decodeJwt<any>(body.token);
  if (!decoded || !isOrderPayload(decoded)) {
    return apiError(400, "Payload im Token ist ungültig.");
  }

  // (Optional) Ablaufprüfung – nur wenn exp existiert
  const exp = (decoded as any).exp;
  if (exp && Math.floor(Date.now() / 1000) > Number(exp)) {
    return apiError(400, "Token abgelaufen.");
  }

  const order: OrderPayload = decoded;
  const totals = computeTotals(order);

  // PREVIEW: Daten an die Order-Page zurückliefern
  if (isPreview) {
    return NextResponse.json({ ok: true, order, totals });
  }

  // SUBMIT: Mails an Kunde, optional Vertrieb und verteiler
  if (isSubmit) {
    if (!body.accept) return apiError(400, "Bitte Bedingungen bestätigen (accept).");

    const customerMail = order.customer.email || body.signer.email;
    const to: string[] = [];
    if (customerMail) to.push(customerMail);
    if (body.salesEmail) to.push(body.salesEmail);
    to.push("vertrieb@xvoice-uc.de");

    const subject = `Auftragsbestätigung – ${order.customer.company || order.customer.contact || order.offerId}`;
    const html = renderMailHTML({
      headline: "Auftragsbestätigung",
      intro:
        `Guten Tag,
         Ihre Bestellung zu Angebot ${order.offerId} wurde bestätigt.
         Unterzeichner: ${escapeHtml(body.signer.name)} (${escapeHtml(body.signer.email)}).`,
      order,
    });

    // Mail senden (mit Fallback auf Log)
    await sendMail({ to, subject, html });

    return NextResponse.json({ ok: true });
  }

  // sollte nicht erreicht werden
  return apiError(400, "Unsupported payload.");
}
