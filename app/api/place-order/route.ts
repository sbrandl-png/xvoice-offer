// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";

/* -------------------- Helpers: JSON/Responses -------------------- */
const ok = (data: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, ...data }, { status: 200 });

const err = (status: number, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });

/* -------------------- Helpers: Body sicher lesen -------------------- */
async function readBodyObject(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    // .json() kann bei leerem Body werfen; daher vorsichtig:
    const text = await req.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

/* -------------------- Helpers: submit tolerant prüfen -------------------- */
function isTruthy(val: unknown) {
  return val === true || val === "true" || val === 1 || val === "1";
}
/** fehlender submit => true, nur explizit false blockt */
function shouldProcessSubmit(val: unknown) {
  if (val === undefined || val === null || val === "") return true;
  return isTruthy(val);
}

/* -------------------- Helpers: Token-Decoding -------------------- */
function base64UrlToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf-8");
}

function safeParseJSON<T = unknown>(raw: string):
  | { ok: true; data: T }
  | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(raw) as T };
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
  // Rohes JSON zulassen
  if (token.trim().startsWith("{")) {
    const p = safeParseJSON(token);
    if (p.ok) return { ok: true, data: p.data };
  }
  // base64url(JSON)
  try {
    const raw = base64UrlToString(token);
    const p = safeParseJSON(raw);
    if (p.ok) return { ok: true, data: p.data };
  } catch {/* ignore */}
  return { ok: false, error: "Token konnte nicht decodiert werden (kein JSON/base64url(JSON))." };
}

/* -------------------- Types & Normalisierung -------------------- */
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
  vatRate?: number; // 0.19
  vat?: number;     // Alias
  createdAt?: number;
  [k: string]: unknown;
};

function normalizeOrderPayload(raw: any): {
  ok: true;
  data: {
    offerId: string;
    customer: Customer;
    monthlyRows: OrderRow[];
    oneTimeRows: OrderRow[];
    vatRate: number;
    createdAt?: number;
  };
} | { ok: false; error: string; missing?: string[] } {
  const payload: OrderLike = raw ?? {};

  const monthlyRowsCand =
    payload.monthlyRows ?? payload.monthly ?? payload.recurring;
  const oneTimeRowsCand =
    payload.oneTimeRows ?? payload.oneTime ?? payload.setup;
  const vatCand =
    typeof payload.vatRate === "number" ? payload.vatRate
    : typeof payload.vat === "number" ? payload.vat
    : undefined;

  const missing: string[] = [];
  if (typeof payload.offerId !== "string" || !payload.offerId) missing.push("offerId");
  if (!Array.isArray(monthlyRowsCand)) missing.push("monthlyRows (oder Alias monthly/recurring)");
  if (!Array.isArray(oneTimeRowsCand)) missing.push("oneTimeRows (oder Alias oneTime/setup)");
  if (typeof vatCand !== "number") missing.push("vatRate (oder Alias vat)");

  if (missing.length) {
    return { ok: false, error: "Orderdaten unvollständig/ungültig", missing };
  }

  // harte Narrowings
  const monthlyRows = monthlyRowsCand as OrderRow[];
  const oneTimeRows = oneTimeRowsCand as OrderRow[];
  const vatRate = vatCand as number;

  return {
    ok: true,
    data: {
      offerId: payload.offerId!,
      customer: payload.customer ?? {},
      monthlyRows,
      oneTimeRows,
      vatRate,
      createdAt: payload.createdAt,
    },
  };
}

/* -------------------- E-Mail HTML -------------------- */
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

  const monthlyNet = order.monthlyRows.reduce((s, r) => s + (r.total ?? r.quantity * r.unit), 0);
  const oneTimeNet = order.oneTimeRows.reduce((s, r) => s + (r.total ?? r.quantity * r.unit), 0);
  const vatFactor = order.vatRate > 1 ? 1 + order.vatRate / 100 : 1 + order.vatRate; // 19 oder 0.19 abfedern
  const monthlyGross = monthlyNet * vatFactor;
  const oneTimeGross = oneTimeNet * vatFactor;

  const row = (r: OrderRow) =>
    `<tr>
      <td>${r.sku}</td>
      <td>${r.name}</td>
      <td style="text-align:right">${r.quantity}</td>
      <td style="text-align:right">${money(r.unit)}</td>
      <td style="text-align:right">${money(r.total ?? r.quantity * r.unit)}</td>
    </tr>`;

  return `
  <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111">
    <h2 style="margin:0 0 12px 0">${title}</h2>
    <p style="margin:0 0 6px 0"><strong>Vorgangsnummer:</strong> ${order.offerId}</p>
    <p style="margin:0 0 16px 0">
      <strong>Kunde:</strong> ${order.customer?.company ?? "-"}<br/>
      <strong>Kontakt:</strong> ${order.customer?.contact ?? "-"}<br/>
      <strong>E-Mail:</strong> ${order.customer?.email ?? "-"} · <strong>Telefon:</strong> ${order.customer?.phone ?? "-"}
    </p>

    <h3 style="margin:16px 0 8px 0">Monatliche Positionen (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead>
        <tr style="background:#f6f6f6">
          <th>SKU</th><th>Bezeichnung</th>
          <th style="text-align:right">Menge</th>
          <th style="text-align:right">Einzel</th>
          <th style="text-align:right">Summe</th>
        </tr>
      </thead>
      <tbody>${order.monthlyRows.map(row).join("")}</tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td>
          <td style="text-align:right"><strong>${money(monthlyNet)}</strong></td>
        </tr>
      </tfoot>
    </table>

    <h3 style="margin:16px 0 8px 0">Einmalige Positionen (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead>
        <tr style="background:#f6f6f6">
          <th>SKU</th><th>Bezeichnung</th>
          <th style="text-align:right">Menge</th>
          <th style="text-align:right">Einzel</th>
          <th style="text-align:right">Summe</th>
        </tr>
      </thead>
      <tbody>${order.oneTimeRows.map(row).join("")}</tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td>
          <td style="text-align:right"><strong>${money(oneTimeNet)}</strong></td>
        </tr>
      </tfoot>
    </table>

    <p style="margin:16px 0 0 0">
      <strong>USt.-Satz:</strong> ${(order.vatRate > 1 ? order.vatRate : order.vatRate * 100).toFixed(0)} %<br/>
      <strong>Monatlich brutto:</strong> ${money(monthlyGross)}<br/>
      <strong>Einmalig brutto:</strong> ${money(oneTimeGross)}
    </p>

    <p style="margin:20px 0 0 0;color:#555">
      Diese Nachricht wurde automatisch durch das xVoice Angebots-/Bestellsystem erzeugt.
    </p>
  </div>`;
}

/* -------------------- Resend Versand (dynamischer Import) -------------------- */
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
      return { ok: false as const, reason: 'Resend SDK nicht verfügbar (Package "resend" fehlt).', results };
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { ok: false as const, reason: "RESEND_API_KEY nicht gesetzt.", results };
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
        if (error) {
          results.push({ to, ok: false, error: String(error) });
        } else {
          results.push({ to, ok: true });
        }
      } catch (e: any) {
        results.push({ to, ok: false, error: e?.message || String(e) });
      }
    }
    const anyFailed = results.some(r => !r.ok);
    return anyFailed ? { ok: false as const, reason: "Teilweise fehlgeschlagen.", results }
                     : { ok: true as const, results };
  } catch (e: any) {
    return { ok: false as const, reason: e?.message || "Unbekannter Fehler beim Resend-Versand.", results };
  }
}

/* -------------------- Route: POST -------------------- */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const qs = Object.fromEntries(url.searchParams.entries());
    const body = await readBodyObject(req);

    // submit fehlertolerant: fehlt => true; nur explizit "false"/0 blockt
    const submitRaw = body["submit"] ?? qs["submit"] ?? req.headers.get("x-submit");
    if (!shouldProcessSubmit(submitRaw)) {
      return err(400, "submit==true erforderlich.");
    }

    // Token aus Body -> Query -> Header -> Cookie
    const headerToken = req.headers.get("x-order-token") || undefined;
    const cookieToken = req.cookies.get("orderToken")?.value || undefined;
    const token =
      (typeof body["token"] === "string" ? (body["token"] as string) : undefined) ||
      (typeof qs["token"] === "string" ? (qs["token"] as string) : undefined) ||
      headerToken ||
      cookieToken ||
      "";

    if (!token) return err(400, "Fehlender Token.");

    const decoded = decodeOrderToken(token);
    if (!decoded.ok) {
      return err(400, "Token ungültig/unsupported.", { reason: decoded.error });
    }

    const norm = normalizeOrderPayload(decoded.data);
    if (!norm.ok) {
      return err(400, "Orderdaten unvollständig/ungültig", { missing: norm.missing });
    }
    const order = norm.data;

    // E-Mail vorbereiten
    const subject = `xVoice UC – Auftragsbestätigung ${order.offerId}`;
    const html = renderEmailHtml("Auftragsbestätigung", order);

    // Empfänger sammeln
    const recipients = new Set<string>();
    recipients.add("vertrieb@xvoice-uc.de");
    if (order.customer?.email) recipients.add(order.customer.email);
    // optionaler Sales: Header/Body
    const salesEmail =
      (typeof body["salesEmail"] === "string" ? (body["salesEmail"] as string) : undefined) ||
      req.headers.get("x-sales-email") ||
      undefined;
    if (salesEmail) recipients.add(salesEmail);

    // Versand (non-blocking würd’ auch gehen; hier bewusst await, damit Resultat sichtbar)
    const mailResult = await sendEmailsViaResend({
      subject,
      html,
      toList: Array.from(recipients),
      from: "vertrieb@xvoice-uc.de",
    });

    return ok({
      message: "Bestellung übernommen.",
      offerId: order.offerId,
      emails: mailResult,
    });
  } catch (e: any) {
    console.error("[place-order] Unhandled error:", e);
    return err(500, "Interner Fehler beim Verarbeiten der Bestellung.");
  }
}

/* -------------------- Route: GET (Debug möglich) -------------------- */
export async function GET(req: NextRequest) {
  // Optionaler einfacher Debug-Endpunkt: erlaubt ?submit=1&token=...
  const url = new URL(req.url);
  const qs = Object.fromEntries(url.searchParams.entries());
  if (!shouldProcessSubmit(qs["submit"])) {
    return err(400, "submit==true erforderlich.");
  }
  const token = (qs["token"] as string) || "";
  if (!token) return err(400, "Fehlender Token.");
  const decoded = decodeOrderToken(token);
  if (!decoded.ok) return err(400, "Token ungültig/unsupported.", { reason: decoded.error });
  const norm = normalizeOrderPayload(decoded.data);
  if (!norm.ok) return err(400, "Orderdaten unvollständig/ungültig", { missing: norm.missing });
  return ok({ message: "Token/Order valide.", offerId: norm.data.offerId });
}
