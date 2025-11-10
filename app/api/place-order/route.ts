import { NextRequest, NextResponse } from "next/server";

/* ---------- JSON helpers ---------- */
const ok = (data: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, ...data }, { status: 200 });
const err = (status: number, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });

/* ---------- submit tolerant (Default: true) ---------- */
function isTruthySubmit(v: unknown) {
  return v === undefined || v === null || v === true || v === "true" || v === 1 || v === "1";
}

/* ---------- token decoding (json or base64url(json)) ---------- */
function base64UrlToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf-8");
}
function safeParseJSON<T = any>(raw: string): { ok: true; data: T } | { ok: false; error: string } {
  try { return { ok: true, data: JSON.parse(raw) }; } catch (e: any) { return { ok: false, error: e?.message || "JSON parse error" }; }
}
function decodeOrderToken(token: string): { ok: true; data: any } | { ok: false; error: string } {
  if (!token || typeof token !== "string") return { ok: false, error: "Leerer oder ungültiger Token." };
  if (token.trim().startsWith("{")) {
    const p = safeParseJSON(token); if (p.ok) return { ok: true, data: p.data };
  }
  try {
    const raw = base64UrlToString(token);
    const p = safeParseJSON(raw); if (p.ok) return { ok: true, data: p.data };
  } catch {}
  return { ok: false, error: "Token konnte nicht decodiert werden (kein JSON/base64url(JSON))." };
}

/* ---------- Types ---------- */
type OrderRow = { sku: string; name: string; quantity: number; unit: number; total?: number };
type Customer = { company?: string; contact?: string; email?: string; phone?: string };

/* ---------- Deep utilities ---------- */
function* walk(obj: any, path: string[] = []): Generator<{ key: string; value: any; path: string[] }> {
  if (!obj || typeof obj !== "object") return;
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    yield { key: k, value: v, path: [...path, k] };
    if (v && typeof v === "object") yield* walk(v, [...path, k]);
  }
}
function first<T>(arr: T[] | undefined): T | undefined { return Array.isArray(arr) && arr.length ? arr[0] : undefined; }

/* ---------- Heuristiken: offerId / vat / rows ---------- */
function findOfferId(input: any): string | undefined {
  const preferred = ["offerId", "offerID", "angebotId", "angebotID", "orderId", "id"];
  for (const { key, value } of walk(input)) {
    if (typeof value === "string") {
      if (preferred.includes(key)) return value;
      const kl = key.toLowerCase();
      if (kl.includes("offer") && kl.includes("id")) return value;
      if (key === "id" && value.length >= 5) return value;
    }
  }
  if (input?.offer?.id && typeof input.offer.id === "string") return input.offer.id;
  return undefined;
}
function findVat(input: any): number | undefined {
  const candidates: number[] = [];
  for (const { key, value } of walk(input)) {
    if (typeof value === "number") {
      const kl = key.toLowerCase();
      if (["vat", "vatrate", "mwst", "ust", "tax", "taxrate", "vat_percent", "vatpercentage"].some(s => kl.includes(s))) {
        candidates.push(value);
      }
    }
  }
  const norm = (v: number) => (v > 1.01 ? v / 100 : v); // 19 -> 0.19
  return first(candidates.map(norm));
}
function asNumber(n: any, fallback = 0): number {
  if (typeof n === "number") return n;
  if (typeof n === "string") {
    const f = Number(n.replace(",", "."));
    return Number.isFinite(f) ? f : fallback;
  }
  return fallback;
}
function mapRowLike(x: any): OrderRow | undefined {
  if (!x || typeof x !== "object") return undefined;
  const sku = x.sku ?? x.code ?? x.itemCode ?? x.article ?? x.productId ?? x.productCode ?? "";
  const name = x.name ?? x.title ?? x.description ?? x.bezeichnung ?? "";
  const quantity = asNumber(x.quantity ?? x.qty ?? x.menge ?? 1, 1);
  const unit = asNumber(x.unit ?? x.price ?? x.unitPrice ?? x.einzelpreis ?? 0, 0);
  const totalRaw = x.total ?? x.sum ?? x.lineTotal ?? x.gesamt ?? undefined;
  const total = totalRaw != null ? asNumber(totalRaw) : undefined;
  if (!sku || !name) return undefined;
  return { sku: String(sku), name: String(name), quantity, unit, total };
}
function looksLikeRowArray(a: any): boolean {
  return Array.isArray(a) && a.length > 0 && typeof a[0] === "object";
}
function findRowArrays(input: any): { monthly?: OrderRow[]; oneTime?: OrderRow[] } {
  const monthlyKeys = ["monthly", "recurring", "monthlyRows", "abo", "mrc", "monatlich"];
  const oneTimeKeys = ["oneTime", "setup", "oneTimeRows", "otc", "einmalig"];
  let monthly: OrderRow[] | undefined;
  let oneTime: OrderRow[] | undefined;

  for (const { key, value, path } of walk(input)) {
    if (looksLikeRowArray(value)) {
      const k = key.toLowerCase();
      const p = path.map(s => s.toLowerCase()).join(".");
      const arr = (value as any[]).map(mapRowLike).filter(Boolean) as OrderRow[];
      if (!arr.length) continue;
      if (!monthly && (monthlyKeys.some(m => k.includes(m) || p.includes(m)))) monthly = arr;
      else if (!oneTime && (oneTimeKeys.some(m => k.includes(m) || p.includes(m)))) oneTime = arr;
    }
  }
  if (!monthly || !oneTime) {
    const allCandidates: OrderRow[][] = [];
    for (const { value } of walk(input)) {
      if (looksLikeRowArray(value)) {
        const arr = (value as any[]).map(mapRowLike).filter(Boolean) as OrderRow[];
        if (arr.length) allCandidates.push(arr);
      }
    }
    if (!monthly) monthly = first(allCandidates);
    if (!oneTime) {
      const second = allCandidates.find(a => a !== monthly);
      oneTime = second ?? [];
    }
  }
  return { monthly, oneTime };
}

/* ---------- Normalisierung (robust) ---------- */
function normalizeOrderPayload(input: any):
  | { ok: true; data: { offerId: string; customer: Customer; monthlyRows: OrderRow[]; oneTimeRows: OrderRow[]; vatRate: number; createdAt?: number } }
  | { ok: false; error: string; missing?: string[]; receivedPreview?: any } {

  const offerIdMaybe = findOfferId(input);
  const vatRateMaybe = findVat(input);
  const rows = findRowArrays(input);

  const customer: Customer = {
    company: input?.customer?.company ?? input?.company ?? input?.kunde ?? input?.customerName,
    contact: input?.customer?.contact ?? input?.contact ?? input?.ansprechpartner,
    email:   input?.customer?.email   ?? input?.email,
    phone:   input?.customer?.phone   ?? input?.phone   ?? input?.telefon,
  };

  const missing: string[] = [];
  if (!offerIdMaybe) missing.push("offerId");
  if (!rows.monthly || rows.monthly.length === 0) missing.push("monthlyRows (oder monthly/recurring)");
  if (!rows.oneTime) missing.push("oneTimeRows (oder oneTime/setup)");
  if (typeof vatRateMaybe !== "number") missing.push("vatRate (oder vat)");

  if (missing.length) {
    const preview = JSON.stringify(input ?? {}, (_k, v) => (typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v), 2);
    return { ok: false, error: "Orderdaten unvollständig/ungültig", missing, receivedPreview: preview.slice(0, 2000) };
  }

  // Ab hier garantiert vorhanden -> Non-Null + explizite Typen
  const offerId: string = offerIdMaybe!;
  const vatRate: number = vatRateMaybe!;
  const monthlyRows: OrderRow[] = rows.monthly!;
  const oneTimeRows: OrderRow[] = rows.oneTime ?? [];

  return {
    ok: true,
    data: { offerId, customer, monthlyRows, oneTimeRows, vatRate, createdAt: input?.createdAt },
  };
}

/* ---------- HTML Mail ---------- */
function renderEmailHtml(
  title: string,
  order: { offerId: string; customer: Customer; monthlyRows: OrderRow[]; oneTimeRows: OrderRow[]; vatRate: number }
) {
  const money = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  const sum = (rows: OrderRow[]) => rows.reduce((s, r) => s + (r.total ?? r.quantity * r.unit), 0);

  const monthlyNet = sum(order.monthlyRows);
  const oneTimeNet = sum(order.oneTimeRows);

  const tr = (r: OrderRow) =>
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
      <strong>Monatlich brutto:</strong> ${money(monthlyNet * (1 + order.vatRate))}<br/>
      <strong>Einmalig brutto:</strong> ${money(oneTimeNet * (1 + order.vatRate))}
    </p>
    <p style="margin:20px 0 0 0;color:#555">Automatisch erzeugt durch das xVoice Angebots-/Bestellsystem.</p>
  </div>`;
}

/* ---------- Resend Versand ---------- */
async function sendEmailsViaResend(params: { subject: string; html: string; toList: string[]; from?: string }) {
  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  try {
    const mod: any = await import("resend").catch(() => null);
    if (!mod?.Resend) return { ok: false, reason: 'Resend SDK nicht verfügbar (Package "resend" fehlt).', results };
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { ok: false, reason: "RESEND_API_KEY nicht gesetzt.", results };

    const resend = new mod.Resend(apiKey);
    const from = params.from || "vertrieb@xvoice-uc.de";

    for (const to of params.toList.filter(Boolean)) {
      try {
        const { error } = await resend.emails.send({ from, to, subject: params.subject, html: params.html });
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

/* ---------- ROUTE ---------- */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const qsSubmit = url.searchParams.get("submit");

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    // submit tolerant (Default true)
    const submitRaw = body?.submit ?? qsSubmit;
    if (!isTruthySubmit(submitRaw)) return err(400, "submit muss truthy sein (true/'true'/1).");

    // Token ODER direkte Orderdaten
    const token: string | undefined = body?.token || undefined;
    let rawOrder: any;
    if (token) {
      const dec = decodeOrderToken(token);
      if (!dec.ok) return err(400, "Token ungültig/unsupported.", { reason: dec.error });
      rawOrder = dec.data;
    } else {
      rawOrder = body?.order ?? body;
    }

    // Normalisieren
    const norm = normalizeOrderPayload(rawOrder);
    if (!norm.ok) return err(400, "Orderdaten unvollständig/ungültig", { missing: norm.missing, receivedPreview: norm.receivedPreview });

    const order = norm.data;

    // Empfänger
    const recipients = new Set<string>();
    recipients.add("vertrieb@xvoice-uc.de");
    const salesEmail: string | undefined = body?.salesEmail || body?.sales?.email || undefined;
    if (salesEmail) recipients.add(salesEmail);
    if (order.customer?.email) recipients.add(order.customer.email);

    // Versand
    const subject = `xVoice UC – Auftragsbestätigung ${order.offerId}`;
    const html = renderEmailHtml("Auftragsbestätigung", order);
    const mailResult = await sendEmailsViaResend({
      subject,
      html,
      toList: Array.from(recipients),
      from: "vertrieb@xvoice-uc.de",
    });

    return ok({ message: "Bestellung übernommen.", offerId: order.offerId, emails: mailResult, usedToken: Boolean(token) });
  } catch (e: any) {
    console.error("[place-order] Unhandled error:", e);
    return err(500, "Interner Fehler beim Verarbeiten der Bestellung.");
  }
}

export async function GET() { return err(405, "Method Not Allowed"); }
