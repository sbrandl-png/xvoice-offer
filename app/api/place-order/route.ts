import { NextRequest, NextResponse } from "next/server";

/* -------------------- Helpers: JSON Responses -------------------- */
const ok = (data: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, ...data }, { status: 200 });

const err = (status: number, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });

/* -------------------- Helpers: submit tolerant prüfen -------------------- */
function isTruthySubmit(v: unknown) {
  return v === true || v === "true" || v === 1 || v === "1";
}

/* -------------------- Helpers: Token -> Objekt (JSON oder base64url(JSON)) -------------------- */
function base64UrlToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf-8");
}

function safeParseJSON<T = any>(raw: string):
  | { ok: true; data: T }
  | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "JSON parse error" };
  }
}

function decodeOrderToken(token: string):
  | { ok: true; data: any }
  | { ok: false; error: string } {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Leerer oder ungültiger Token." };
  }
  if (token.trim().startsWith("{")) {
    const p = safeParseJSON(token);
    if (p.ok) return { ok: true, data: p.data };
  }
  try {
    const raw = base64UrlToString(token);
    const p = safeParseJSON(raw);
    if (p.ok) return { ok: true, data: p.data };
  } catch {}
  return { ok: false, error: "Token konnte nicht decodiert werden (kein JSON/base64url(JSON))." };
}

/* -------------------- Types -------------------- */
type OrderRow = { sku: string; name: string; quantity: number; unit: number; total?: number };
type Customer = { company?: string; contact?: string; email?: string; phone?: string };
type OrderLike = {
  offerId?: string;
  customer?: Customer;
  monthlyRows?: OrderRow[];
  oneTimeRows?: OrderRow[];
  monthly?: OrderRow[];
  recurring?: OrderRow[];
  oneTime?: OrderRow[];
  setup?: OrderRow[];
  vatRate?: number;
  vat?: number;
  createdAt?: number;
  [k: string]: any;
};

/* -------------------- Normalisierung (alte & neue Payloads akzeptieren) -------------------- */
function normalizeOrderPayload(input: any):
  | {
      ok: true;
      data: {
        offerId: string;
        customer: Customer;
        monthlyRows: OrderRow[];
        oneTimeRows: OrderRow[];
        vatRate: number;
        createdAt?: number;
      };
    }
  | { ok: false; error: string; missing?: string[] } {
  const payload: OrderLike = input ?? {};

  // Aliasse zusammenführen
  const monthlyRowsCand = payload.monthlyRows ?? payload.monthly ?? payload.recurring;
  const oneTimeRowsCand = payload.oneTimeRows ?? payload.oneTime ?? payload.setup;
  const vatCand =
    typeof payload.vatRate === "number"
      ? payload.vatRate
      : typeof payload.vat === "number"
      ? payload.vat
      : undefined;

  const missing: string[] = [];
  if (typeof payload.offerId !== "string" || !payload.offerId) missing.push("offerId");
  if (!Array.isArray(monthlyRowsCand)) missing.push("monthlyRows (oder monthly/recurring)");
  if (!Array.isArray(oneTimeRowsCand)) missing.push("oneTimeRows (oder oneTime/setup)");
  if (typeof vatCand !== "number") missing.push("vatRate (oder vat)");

  if (missing.length) {
    return {
      ok: false,
      error: "Orderdaten unvollständig/ungültig",
      missing,
    };
  }

  return {
    ok: true,
    data: {
      offerId: payload.offerId!,
      customer: payload.customer ?? {},
      monthlyRows: monthlyRowsCand as OrderRow[],
      oneTimeRows: oneTimeRowsCand as OrderRow[],
      vatRate: vatCand as number,
      createdAt: payload.createdAt,
    },
  };
}

/* -------------------- HTML-E-Mail -------------------- */
function renderEmailHtml(
  title: string,
  order: {
    offerId: string;
    customer: Customer;
    monthlyRows: OrderRow[];
    oneTimeRows: OrderRow[];
    vatRate: number;
  }
) {
  const money = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const sum = (rows: OrderRow[]) =>
    rows.reduce((s, r) => s + (r.total ?? r.quantity * r.unit), 0);

  const monthlyNet = sum(order.monthlyRows);
  const oneTimeNet = sum(order.oneTimeRows);
  const vatFactor = 1 + order.vatRate;

  const row = (r: OrderRow) =>
    `<tr><td>${r.sku}</td><td>${r.name}</td><td style="text-align:right">${r.quantity}</td><td style="text-align:right">${money(r.unit)}</td><td style="text-align:right">${money(r.total ?? r.quantity * r.unit)}</td></tr>`;

  return `
  <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#111">
    <h2 style="margin:0 0 12px 0">${title}</h2>
    <p style="margin:0 0 6px 0"><strong>Vorgangsnummer:</strong> ${order.offerId}</p>
    <p style="margin:0 0 16px 0">
      <strong>Kunde:</strong> ${order.customer?.company ?? "-"}<br/>
      <strong>Kontakt:</strong> ${order.customer?.contact ?? "-"}<br/>
      <strong>E-Mail:</strong> ${order.customer?.email ?? "-"} · <strong>Telefon:</strong> ${order.customer?.phone ?? "-"}
    </p>

    <h3 style="margin:16px 0 8px 0">Monatliche Positionen (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead><tr style="background:#f6f6f6"><th>SKU</th><th>Bezeichnung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzel</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${order.monthlyRows.map(row).join("")}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td><td style="text-align:right"><strong>${money(monthlyNet)}</strong></td></tr></tfoot>
    </table>

    <h3 style="margin:16px 0 8px 0">Einmalige Positionen (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead><tr style="background:#f6f6f6"><th>SKU</th><th>Bezeichnung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzel</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${order.oneTimeRows.map(row).join("")}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td><td style="text-align:right"><strong>${money(oneTimeNet)}</strong></td></tr></tfoot>
    </table>

    <p style="margin:16px 0 0 0">
      <strong>USt.-Satz:</strong> ${(order.vatRate * 100).toFixed(0)} %<br/>
      <strong>Monatlich brutto:</strong> ${money(monthlyNet * vatFactor)}<br/>
      <strong>Einmalig brutto:</strong> ${money(oneTimeNet * vatFactor)}
    </p>

    <p style="margin:20px 0 0 0;color:#555">Automatisch erzeugt durch das xVoice Angebots-/Bestellsystem.</p>
  </div>`;
}

/* -------------------- Resend Versand -------------------- */
async function sendEmailsViaResend(params: {
  subject: string;
  html: string;
  toList: string[];
  from?: string;
}) {
  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  try {
    const mod: any = await import("resend").catch(() => null);
    if (!mod || !mod.Resend) {
      return { ok: false, reason: 'Resend SDK nicht verfügbar (Package "resend" fehlt).', results };
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { ok: false, reason: "RESEND_API_KEY nicht gesetzt.", results };
    }
    const resend = new mod.Resend(apiKey);
    const from = params.from || "vertrieb@xvoice-uc.de";

    for (const to of params.toList.filter(Boolean)) {
      try {
        const { error } = await resend.emails.send({
          from,
          to,
          subject: params.subject,
          html: params.html,
        });
        if (error) results.push({ to, ok: false, error: String(error) });
        else results.push({ to, ok: true });
      } catch (e: any) {
        results.push({ to, ok: false, error: e?.message || String(e) });
      }
    }
    const anyFailed = results.some(r => !r.ok);
    return anyFailed ? { ok: false, reason: "Teilweise fehlgeschlagen.", results } : { ok: true, results };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Unbekannter Fehler beim Resend-Versand.", results };
  }
}

/* -------------------- ROUTE -------------------- */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const qsSubmit = url.searchParams.get("submit");

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // 1) submit – fehlt => wird als true behandelt (bricht also nicht mehr ab)
    const submitRaw = body?.submit ?? qsSubmit;
    const submit = submitRaw == null ? true : isTruthySubmit(submitRaw);
    if (!submit) return err(400, "submit muss truthy sein (true/'true'/1).");

    // 2) Token ODER direkte Orderdaten akzeptieren
    const token: string | undefined = body?.token || undefined;

    let rawOrder: any | undefined;
    if (token) {
      const decoded = decodeOrderToken(token);
      if (!decoded.ok) {
        return err(400, "Token ungültig/unsupported.", { reason: decoded.error });
      }
      rawOrder = decoded.data;
    } else {
      // Fallback: direkte Daten aus Body (kompatibel zum „alten“ Verhalten)
      rawOrder = body?.order ?? body;
    }

    // 3) Normalisieren & validieren
    const norm = normalizeOrderPayload(rawOrder);
    if (!norm.ok) {
      return err(400, "Orderdaten unvollständig/ungültig", { missing: norm.missing });
    }

    const order = norm.data;

    // 4) Empfänger bestimmen
    const salesEmail: string | undefined = body?.salesEmail || undefined;
    const signer: { name?: string; email?: string } | undefined = body?.signer || undefined;

    const recipients = new Set<string>();
    recipients.add("vertrieb@xvoice-uc.de");
    if (salesEmail) recipients.add(salesEmail);
    if (order.customer?.email) recipients.add(order.customer.email);

    // 5) E-Mail rendern & versenden
    const subject = `xVoice UC – Auftragsbestätigung ${order.offerId}`;
    const html = renderEmailHtml("Auftragsbestätigung", order);

    const mailResult = await sendEmailsViaResend({
      subject,
      html,
      toList: Array.from(recipients),
      from: "vertrieb@xvoice-uc.de",
    });

    // 6) Response
    return ok({
      message: "Bestellung übernommen.",
      offerId: order.offerId,
      emails: mailResult,
      signer: signer?.email ? { email: signer.email, name: signer.name } : undefined,
      usedToken: Boolean(token),
    });
  } catch (e: any) {
    console.error("[place-order] Unhandled error:", e);
    return err(500, "Interner Fehler beim Verarbeiten der Bestellung.");
  }
}

export async function GET() {
  return err(405, "Method Not Allowed");
}
