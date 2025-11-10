// app/api/place-order/route.ts
import { NextResponse } from "next/server";

// ---------- Typen ----------
type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  unit: number; // Netto Einzelpreis
  total: number; // Netto Zeilensumme (quantity * unit)
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
  createdAt?: number; // epoch ms
};

type NormalizedResult =
  | { ok: true; order: OrderPayload }
  | { ok: false; reasons: string[] };

// ---------- Utils ----------
const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const DATE = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

function formatEuro(n: number) {
  return EUR.format(n);
}

function safeNumber(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

// sehr tolerantes Decoding eines JWT-ähnlichen Tokens (ohne Signaturprüfung)
// akzeptiert auch Base64(JSON) als "Token"
function decodeTokenUnsafe(token: string): any {
  try {
    // JWT: nehmen wir die Payload (Teil 2)
    if (token.includes(".")) {
      const payloadPart = token.split(".")[1]!;
      const json = Buffer.from(payloadPart, "base64url").toString("utf8");
      return JSON.parse(json);
    }
    // Fallback: Base64 -> JSON
    const json = Buffer.from(token, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeOrder(input: any): NormalizedResult {
  const reasons: string[] = [];
  const offerId = input?.offerId;

  const monthlyRows =
    input?.monthlyRows ?? input?.monthly ?? input?.recurring ?? [];
  const oneTimeRows =
    input?.oneTimeRows ?? input?.oneTime ?? input?.setup ?? [];
  const vatRate = input?.vatRate ?? input?.vat;

  if (typeof offerId !== "string" || !offerId.trim()) reasons.push("offerId");
  if (!Array.isArray(monthlyRows)) reasons.push("monthlyRows");
  if (!Array.isArray(oneTimeRows)) reasons.push("oneTimeRows");
  if (typeof vatRate !== "number") reasons.push("vatRate");

  if (reasons.length) return { ok: false, reasons };

  const customer: Customer = input?.customer ?? {};
  const createdAt: number = typeof input?.createdAt === "number" ? input.createdAt : Date.now();

  return {
    ok: true,
    order: { offerId, customer, monthlyRows, oneTimeRows, vatRate, createdAt },
  };
}

function calcTotals(order: OrderPayload) {
  const netMonthly = safeNumber(order.monthlyRows?.reduce((s, r) => s + safeNumber(r.total), 0));
  const netOneTime = safeNumber(order.oneTimeRows?.reduce((s, r) => s + safeNumber(r.total), 0));
  const vatMonthly = netMonthly * order.vatRate;
  const vatOneTime = netOneTime * order.vatRate;
  const grossMonthly = netMonthly + vatMonthly;
  const grossOneTime = netOneTime + vatOneTime;
  return { netMonthly, netOneTime, vatMonthly, vatOneTime, grossMonthly, grossOneTime };
}

function renderRowsTable(rows: OrderRow[]) {
  if (!rows?.length) return `<p style="margin:8px 0;color:#666;">Keine Positionen.</p>`;
  const head = `
    <thead>
      <tr>
        <th align="left" style="padding:8px;border-bottom:1px solid #eee;">SKU</th>
        <th align="left" style="padding:8px;border-bottom:1px solid #eee;">Bezeichnung</th>
        <th align="right" style="padding:8px;border-bottom:1px solid #eee;">Menge</th>
        <th align="right" style="padding:8px;border-bottom:1px solid #eee;">Einzelpreis (netto)</th>
        <th align="right" style="padding:8px;border-bottom:1px solid #eee;">Summe (netto)</th>
      </tr>
    </thead>`;

  const body = rows
    .map((r) => {
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #f3f3f3;">${escapeHtml(r.sku ?? "")}</td>
        <td style="padding:8px;border-bottom:1px solid #f3f3f3;">${escapeHtml(r.name ?? "")}</td>
        <td align="right" style="padding:8px;border-bottom:1px solid #f3f3f3;">${safeNumber(r.quantity)}</td>
        <td align="right" style="padding:8px;border-bottom:1px solid #f3f3f3;">${formatEuro(safeNumber(r.unit))}</td>
        <td align="right" style="padding:8px;border-bottom:1px solid #f3f3f3;">${formatEuro(safeNumber(r.total))}</td>
      </tr>`;
    })
    .join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;margin:8px 0 16px 0;">
    ${head}
    <tbody>${body}</tbody>
  </table>`;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderOrderHtml(order: OrderPayload) {
  const { netMonthly, netOneTime, vatMonthly, vatOneTime, grossMonthly, grossOneTime } = calcTotals(order);
  const cust = order.customer ?? {};
  const logo = "https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x";

  return `<!doctype html>
<html lang="de">
  <body style="margin:0;background:#f6f7f9;padding:24px;">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 6px 24px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="background:#111114;color:#fff;padding:20px 24px;display:flex;align-items:center;">
        <img src="${logo}" alt="xVoice UC" style="height:32px;display:block;margin-right:12px" />
        <div style="font-weight:600;font-size:16px;">Auftragsbestätigung – ${escapeHtml(order.offerId)}</div>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 12px 0;color:#111114;font-size:16px;font-weight:600">Kundendaten</p>
        <div style="background:#f7f7f8;border:1px solid #ececef;border-radius:12px;padding:12px 16px;font-size:14px;color:#303036;line-height:1.45">
          <div><strong>Firma:</strong> ${escapeHtml(cust.company ?? "–")}</div>
          <div><strong>Kontakt:</strong> ${escapeHtml(cust.contact ?? "–")}</div>
          <div><strong>E-Mail:</strong> ${escapeHtml(cust.email ?? "–")}</div>
          <div><strong>Telefon:</strong> ${escapeHtml(cust.phone ?? "–")}</div>
          <div><strong>Adresse:</strong> ${escapeHtml([cust.street, cust.zip, cust.city].filter(Boolean).join(", ") || "–")}</div>
        </div>

        <p style="margin:20px 0 8px 0;color:#111114;font-size:16px;font-weight:600">Monatliche Positionen</p>
        ${renderRowsTable(order.monthlyRows)}

        <p style="margin:20px 0 8px 0;color:#111114;font-size:16px;font-weight:600">Einmalige Positionen</p>
        ${renderRowsTable(order.oneTimeRows)}

        <div style="margin-top:16px;border-top:1px dashed #e5e7eb;padding-top:16px;font-size:14px;color:#111114">
          <div style="display:flex;justify-content:flex-end;gap:24px;flex-wrap:wrap">
            <div>
              <div style="font-weight:600;margin-bottom:6px">Zusammenfassung monatlich</div>
              <div>Netto: ${formatEuro(netMonthly)}</div>
              <div>USt (${(order.vatRate * 100).toFixed(0)}%): ${formatEuro(vatMonthly)}</div>
              <div><strong>Brutto: ${formatEuro(grossMonthly)}</strong></div>
            </div>
            <div>
              <div style="font-weight:600;margin-bottom:6px">Zusammenfassung einmalig</div>
              <div>Netto: ${formatEuro(netOneTime)}</div>
              <div>USt (${(order.vatRate * 100).toFixed(0)}%): ${formatEuro(vatOneTime)}</div>
              <div><strong>Brutto: ${formatEuro(grossOneTime)}</strong></div>
            </div>
          </div>
          <div style="margin-top:12px;color:#6b7280">Erstellt am ${DATE.format(new Date(order.createdAt ?? Date.now()))}</div>
        </div>

        <div style="margin-top:24px;padding:12px 16px;background:#fff4ee;border:1px solid #ffeadf;border-radius:12px;color:#7a2e0e">
          Vielen Dank für Ihre Bestellung. Unsere Technik meldet sich für das Kick-off-Gespräch zur Konfiguration.
        </div>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #eee;color:#6b7280;font-size:12px;text-align:center">
        © ${new Date().getFullYear()} xVoice UC UG (haftungsbeschränkt) · Peter-Müller-Straße 3, 40468 Düsseldorf ·
        <a href="https://www.xvoice-uc.de/impressum" style="color:#6b7280">Impressum & Datenschutz</a>
      </div>
    </div>
  </body>
</html>`;
}

// ---------- Mailversand (SMTP via Nodemailer, optional) ----------
async function sendEmails(params: {
  order: OrderPayload;
  signer?: { name?: string; email?: string };
  salesEmail?: string;
}) {
  const { order, signer, salesEmail } = params;
  const html = renderOrderHtml(order);

  const recipients: string[] = [];
  if (order.customer?.email) recipients.push(order.customer.email);
  if (salesEmail) recipients.push(salesEmail);
  recipients.push("vertrieb@xvoice-uc.de");

  // Wenn keine SMTP ENV vorhanden ist, nur Loggen – kein Build-Fehler
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    console.log("[place-order] SMTP-ENV fehlen – würde senden an:", recipients);
    return;
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Boolean(process.env.SMTP_SECURE ?? false),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });

  const from = process.env.SMTP_FROM!;
  const subject = `Auftragsbestätigung ${order.offerId} – xVoice UC`;

  // Einzelversand, damit BCC/DSGVO sauber bleibt
  for (const to of recipients) {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
  }

  // Bestätigung an Unterzeichner (falls separat gewünscht und nicht schon enthalten)
  if (signer?.email && !recipients.includes(signer.email)) {
    await transporter.sendMail({
      from,
      to: signer.email,
      subject,
      html,
    });
  }
}

// ---------- Route Handlers ----------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const submitFlag = typeof body?.submit === "undefined" ? true : Boolean(body.submit);
    if (!submitFlag) {
      return NextResponse.json(
        { ok: false, error: "submit==true erforderlich." },
        { status: 400 }
      );
    }

    const token: string | undefined = body?.token;
    const providedOrder: any = body?.order;

    let rawOrder: any = null;

    if (token) {
      const decoded = decodeTokenUnsafe(token);
      if (!decoded) {
        return NextResponse.json({ ok: false, error: "Ungültiges oder nicht lesbares Token." }, { status: 400 });
      }
      // Token kann entweder direkt die Order enthalten ODER unter .order liegen
      rawOrder = decoded?.order ?? decoded;
      // exp (Sekunden) optional prüfen
      if (decoded?.exp && Math.floor(Date.now() / 1000) > Number(decoded.exp)) {
        return NextResponse.json({ ok: false, error: "Token abgelaufen." }, { status: 400 });
      }
    } else if (providedOrder) {
      rawOrder = providedOrder;
    } else {
      return NextResponse.json(
        { ok: false, error: "Weder token noch order angegeben." },
        { status: 400 }
      );
    }

    const norm = normalizeOrder(rawOrder);
    if (!("ok" in norm) || !norm.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Orderdaten unvollständig/ungültig: " + norm.reasons.join(", "),
        },
        { status: 400 }
      );
    }

    const order = norm.order;
    const signer = body?.signer as { name?: string; email?: string } | undefined;
    const salesEmail = typeof body?.salesEmail === "string" ? body.salesEmail : undefined;

    // Versand
    await sendEmails({ order, signer, salesEmail });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const msg = err?.message || String(err);
    return NextResponse.json(
      { ok: false, error: `Signierfehler: ${msg}` },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  // einfache CORS-Preflight-Unterstützung (optional)
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
