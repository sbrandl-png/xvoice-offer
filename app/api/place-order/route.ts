// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";

/** ---------- helpers ---------- */
const ok  = (data: Record<string, unknown> = {}) => NextResponse.json({ ok: true,  ...data }, { status: 200 });
const err = (status: number, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });

function base64UrlToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf-8");
}
function safeParseJSON<T = any>(raw: string): { ok: true; data: T } | { ok: false; error: string } {
  try { return { ok: true, data: JSON.parse(raw) }; } catch (e: any) { return { ok: false, error: e?.message || "JSON parse error" }; }
}
function decodeTokenMaybe(token?: string) {
  if (!token || typeof token !== "string") return { ok: false as const, error: "no token" };
  if (token.trim().startsWith("{")) {
    const p = safeParseJSON(token); if (p.ok) return { ok: true as const, data: p.data };
  }
  try {
    const raw = base64UrlToString(token);
    const p = safeParseJSON(raw); if (p.ok) return { ok: true as const, data: p.data };
  } catch {}
  return { ok: false as const, error: "unsupported token" };
}

type OrderRow = { sku: string; name: string; quantity: number; unit: number; total?: number };
type Customer = { company?: string; contact?: string; email?: string; phone?: string };
type Order = { offerId: string; customer: Customer; monthlyRows: OrderRow[]; oneTimeRows: OrderRow[]; vatRate: number; createdAt?: number };

const asNum = (v: any, d = 0) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : d; }
  return d;
};
const mapRow = (x: any): OrderRow | undefined => {
  if (!x || typeof x !== "object") return undefined;
  const sku = x.sku ?? x.code ?? x.itemCode ?? x.productCode ?? x.article ?? "";
  const name = x.name ?? x.title ?? x.description ?? x.bezeichnung ?? "";
  const quantity = asNum(x.quantity ?? x.qty ?? x.menge ?? 1, 1);
  const unit = asNum(x.unit ?? x.unitPrice ?? x.price ?? x.einzelpreis ?? 0, 0);
  const total = x.total != null ? asNum(x.total) : undefined;
  if (!sku || !name) return undefined;
  return { sku: String(sku), name: String(name), quantity, unit, total };
};

function normalize(inputRaw: any): { ok: true; data: Order } | { ok: false; error: string; missing: string[]; preview?: any } {
  const input = inputRaw ?? {};

  // offerId
  const offerId =
    (typeof input.offerId === "string" && input.offerId) ? input.offerId :
    (typeof input.offer?.id === "string" && input.offer.id) ? input.offer.id :
    (typeof input.id === "string" && input.id.length >= 5) ? input.id : undefined;

  // rows
  const monthlyCandidate = input.monthlyRows ?? input.monthly ?? input.recurring;
  const oneTimeCandidate = input.oneTimeRows ?? input.oneTime ?? input.setup;
  const monthlyRows = Array.isArray(monthlyCandidate) ? (monthlyCandidate.map(mapRow).filter(Boolean) as OrderRow[]) : undefined;
  const oneTimeRows = Array.isArray(oneTimeCandidate) ? (oneTimeCandidate.map(mapRow).filter(Boolean) as OrderRow[]) : [];

  // vat
  let vatRate =
    typeof input.vatRate === "number" ? input.vatRate :
    (typeof input.vat === "number" ? input.vat : undefined);
  if (typeof vatRate === "number" && vatRate > 1.01) vatRate = vatRate / 100; // 19 -> 0.19

  const missing: string[] = [];
  if (!offerId) missing.push("offerId");
  if (!monthlyRows || monthlyRows.length === 0) missing.push("monthlyRows (oder monthly/recurring)");
  if (!oneTimeRows) missing.push("oneTimeRows (oder oneTime/setup)");
  if (typeof vatRate !== "number") missing.push("vatRate (oder vat)");

  if (missing.length) {
    const preview = JSON.stringify(input, (_k, v) => (typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v), 2);
    return { ok: false, error: "Orderdaten unvollständig/ungültig", missing, preview: preview.slice(0, 1500) };
  }

  const customer: Customer = {
    company: input.customer?.company ?? input.company ?? input.customerName,
    contact: input.customer?.contact ?? input.contact ?? input.ansprechpartner,
    email:   input.customer?.email   ?? input.email,
    phone:   input.customer?.phone   ?? input.phone,
  };

  return {
    ok: true,
    data: {
      offerId: offerId!,                       // non-null ab hier sicher
      customer,
      monthlyRows: monthlyRows!,               // non-null
      oneTimeRows,                             // ggf. leeres Array
      vatRate: vatRate!,                       // non-null
      createdAt: input.createdAt,
    },
  };
}

function renderEmailHtml(title: string, order: Order) {
  const money = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  const sum = (rows: OrderRow[]) => rows.reduce((s, r) => s + (r.total ?? r.quantity * r.unit), 0);
  const tr = (r: OrderRow) =>
    `<tr><td>${r.sku}</td><td>${r.name}</td><td style="text-align:right">${r.quantity}</td><td style="text-align:right">${money(r.unit)}</td><td style="text-align:right">${money(r.total ?? r.quantity * r.unit)}</td></tr>`;

  const monthlyNet = sum(order.monthlyRows);
  const oneTimeNet = sum(order.oneTimeRows);
  const gross = (n: number) => money(n * (1 + order.vatRate));

  return `
  <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#111">
    <h2 style="margin:0 0 12px 0">${title}</h2>
    <p style="margin:0 0 6px 0"><strong>Vorgangsnummer:</strong> ${order.offerId}</p>
    <p style="margin:0 0 16px 0">
      <strong>Kunde:</strong> ${order.customer?.company ?? "-"}<br/>
      <strong>Kontakt:</strong> ${order.customer?.contact ?? "-"}<br/>
      <strong>E-Mail:</strong> ${order.customer?.email ?? "-"} · <strong>Telefon:</strong> ${order.customer?.phone ?? "-"}
    </p>
    <h3 style="margin:16px 0 8px 0">Monatlich (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead><tr style="background:#f6f6f6"><th>SKU</th><th>Bezeichnung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzel</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${order.monthlyRows.map(tr).join("")}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td><td style="text-align:right"><strong>${money(monthlyNet)}</strong></td></tr></tfoot>
    </table>
    <h3 style="margin:16px 0 8px 0">Einmalig (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead><tr style="background:#f6f6f6"><th>SKU</th><th>Bezeichnung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzel</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${order.oneTimeRows.map(tr).join("")}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td><td style="text-align:right"><strong>${money(oneTimeNet)}</strong></td></tr></tfoot>
    </table>
    <p style="margin:16px 0 0 0">
      <strong>USt.-Satz:</strong> ${(order.vatRate * 100).toFixed(0)} %<br/>
      <strong>Monatlich brutto:</strong> ${gross(monthlyNet)}<br/>
      <strong>Einmalig brutto:</strong> ${gross(oneTimeNet)}
    </p>
    <p style="margin:20px 0 0 0;color:#555">Automatisch erzeugt durch das xVoice Angebots-/Bestellsystem.</p>
  </div>`;
}

/** ---------- Resend Versand ---------- */
async function sendEmailsViaResend(subject: string, html: string, toList: string[], from = "vertrieb@xvoice-uc.de") {
  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  try {
    const mod: any = await import("resend").catch(() => null);
    if (!mod?.Resend) return { ok: false, reason: 'Resend SDK nicht verfügbar (Package "resend" fehlt).', results };
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { ok: false, reason: "RESEND_API_KEY nicht gesetzt.", results };

    const resend = new mod.Resend(apiKey);
    for (const to of toList.filter(Boolean)) {
      try {
        const { error } = await resend.emails.send({ from, to, subject, html });
        results.push(error ? { to, ok: false, error: String(error) } : { to, ok: true });
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

/** ---------- ROUTE ---------- */
export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    // 1) Payload beziehen: token oder direkte Felder
    let rawOrder: any = undefined;
    const token = body?.token as string | undefined;
    const decoded = decodeTokenMaybe(token);
    rawOrder = decoded.ok ? decoded.data : (body?.order ?? body);

    // 2) Normalisieren & validieren
    const norm = normalize(rawOrder);
    if (!norm.ok) return err(400, "Orderdaten unvollständig/ungültig", { missing: norm.missing, preview: norm.preview });
    const order = norm.data;

    // 3) Empfänger aufbauen
    const recipients = new Set<string>();
    recipients.add("vertrieb@xvoice-uc.de");
    if (body?.salesEmail) recipients.add(String(body.salesEmail));
    if (order.customer?.email) recipients.add(order.customer.email);

    // 4) E-Mail versenden
    const subject = `xVoice UC – Auftragsbestätigung ${order.offerId}`;
    const html = renderEmailHtml("Auftragsbestätigung", order);
    const emailResult = await sendEmailsViaResend(subject, html, Array.from(recipients));

    return ok({ message: "Bestellung übernommen.", offerId: order.offerId, emails: emailResult, usedToken: decoded.ok });
  } catch (e: any) {
    console.error("[place-order] Unhandled error:", e);
    return err(500, "Interner Fehler beim Verarbeiten der Bestellung.");
  }
}

export async function GET() {
  return err(405, "Method Not Allowed");
}
