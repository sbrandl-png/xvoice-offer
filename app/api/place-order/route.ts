import { NextRequest, NextResponse } from "next/server";

/** ---------- Helper: JSON/Responses ---------- */
const ok = (data: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, ...data }, { status: 200 });

const err = (status: number, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });

/** ---------- Helper: submit tolerant prüfen ---------- */
function isTruthySubmit(v: unknown) {
  return v === true || v === "true" || v === 1 || v === "1";
}

/** ---------- Helper: Token -> Objekt (JSON oder base64url(JSON)) ---------- */
function base64UrlToString(b64url: string): string {
  // base64url -> base64
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  // padding fix
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const b64p = b64 + pad;
  // Browser/Edge Runtime friendly decode
  if (typeof atob === "function") return atob(b64p);
  // Node fallback
  return Buffer.from(b64p, "base64").toString("utf-8");
}

function safeParseJSON<T = any>(raw: string): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const data = JSON.parse(raw);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "JSON parse error" };
  }
}

/**
 * Versucht Reihenfolge:
 * 1) Token ist schon JSON-String
 * 2) Token ist Base64URL-kodierter JSON-String
 */
function decodeOrderToken(token: string): { ok: true; data: any } | { ok: false; error: string } {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Leerer oder ungültiger Token." };
  }

  // Fall 1: direktes JSON
  if (token.trim().startsWith("{")) {
    const p = safeParseJSON(token);
    if (p.ok) return { ok: true, data: p.data };
  }

  // Fall 2: base64url(JSON)
  try {
    const raw = base64UrlToString(token);
    const p = safeParseJSON(raw);
    if (p.ok) return { ok: true, data: p.data };
  } catch {
    // ignore, fällt auf Fehler unten
  }

  return { ok: false, error: "Token konnte nicht decodiert werden (kein JSON/base64url(JSON))." };
}

/** ---------- Types (locker, damit Build sicher ist) ---------- */
type OrderRow = { sku: string; name: string; quantity: number; unit: number; total: number };
type Customer = { company?: string; contact?: string; email?: string; phone?: string };

type OrderLike = {
  offerId?: string;
  customer?: Customer;
  monthlyRows?: OrderRow[];
  oneTimeRows?: OrderRow[];
  // Aliase, die wir akzeptieren und auf obige Felder mappen:
  monthly?: OrderRow[];
  recurring?: OrderRow[];
  oneTime?: OrderRow[];
  setup?: OrderRow[];
  vatRate?: number;
  vat?: number;
  createdAt?: number;
  [k: string]: any;
};

/** ---------- Normalisierung: Aliase auf Standardfelder ---------- */
function normalizeOrderPayload(raw: any): {
  ok: true; data: Required<Pick<OrderLike, "offerId" | "vatRate" | "customer" | "monthlyRows" | "oneTimeRows">> & { createdAt?: number }
} | { ok: false; error: string; missing?: string[] } {
  const payload: OrderLike = raw ?? {};
  const monthlyRows = payload.monthlyRows ?? payload.monthly ?? payload.recurring;
  const oneTimeRows = payload.oneTimeRows ?? payload.oneTime ?? payload.setup;
  const vatRate = typeof payload.vatRate === "number" ? payload.vatRate : (typeof payload.vat === "number" ? payload.vat : undefined);

  const missing: string[] = [];
  if (typeof payload.offerId !== "string" || !payload.offerId) missing.push("offerId");
  if (!Array.isArray(monthlyRows)) missing.push("monthlyRows (oder Alias monthly/recurring)");
  if (!Array.isArray(oneTimeRows)) missing.push("oneTimeRows (oder Alias oneTime/setup)");
  if (typeof vatRate !== "number") missing.push("vatRate (oder Alias vat)");

  if (missing.length) {
    return { ok: false, error: "Orderdaten unvollständig/ungültig", missing };
  }

  const customer: Customer = payload.customer ?? {};
  return {
    ok: true,
    data: {
      offerId: payload.offerId!,
      customer,
      monthlyRows,
      oneTimeRows,
      vatRate: vatRate!,
      createdAt: payload.createdAt,
    },
  };
}

/** ---------- HTML E-Mail: kompakte Zusammenfassung ---------- */
function renderEmailHtml(title: string, order: Required<Pick<OrderLike, "offerId" | "vatRate" | "customer" | "monthlyRows" | "oneTimeRows">>) {
  const money = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

  const monthlySum = order.monthlyRows.reduce((s, r) => s + (r.total ?? r.quantity * r.unit), 0);
  const otSum = order.oneTimeRows.reduce((s, r) => s + (r.total ?? r.quantity * r.unit), 0);
  const vatFactor = 1 + order.vatRate;
  const monthlyGross = monthlySum * vatFactor;
  const otGross = otSum * vatFactor;

  const row = (r: OrderRow) =>
    `<tr><td>${r.sku}</td><td>${r.name}</td><td style="text-align:right">${r.quantity}</td><td style="text-align:right">${money(r.unit)}</td><td style="text-align:right">${money(r.total ?? r.quantity * r.unit)}</td></tr>`;

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
      <thead><tr style="background:#f6f6f6"><th>SKU</th><th>Bezeichnung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzel</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${order.monthlyRows.map(row).join("")}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td><td style="text-align:right"><strong>${money(monthlySum)}</strong></td></tr></tfoot>
    </table>

    <h3 style="margin:16px 0 8px 0">Einmalige Positionen (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead><tr style="background:#f6f6f6"><th>SKU</th><th>Bezeichnung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzel</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${order.oneTimeRows.map(row).join("")}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td><td style="text-align:right"><strong>${money(otSum)}</strong></td></tr></tfoot>
    </table>

    <p style="margin:16px 0 0 0">
      <strong>USt.-Satz:</strong> ${(order.vatRate * 100).toFixed(0)} %<br/>
      <strong>Monatlich brutto:</strong> ${money(monthlyGross)}<br/>
      <strong>Einmalig brutto:</strong> ${money(otGross)}
    </p>

    <p style="margin:20px 0 0 0;color:#555">Diese Nachricht wurde automatisch durch das xVoice Angebots-/Bestellsystem erzeugt.</p>
  </div>`;
}

/** ---------- Resend Versand (optional) ---------- */
async function sendEmailsViaResend(params: {
  subject: string;
  html: string;
  toList: string[];
  from?: string;
}) {
  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  try {
    // dynamischer Import, damit der Build nicht scheitert, falls "resend" nicht installiert ist
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

    // Einzelversand je Empfänger → klares Ergebnis je Adresse
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
    return anyFailed ? { ok: false, reason: "Teilweise fehlgeschlagen.", results } : { ok: true, results };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Unbekannter Fehler beim Resend-Versand.", results };
  }
}

/** ---------- Route ---------- */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const qsSubmit = url.searchParams.get("submit");
    const body = await req.json().catch(() => ({} as any));

    const submit = body?.submit ?? qsSubmit;
    if (!isTruthySubmit(submit)) {
      return err(400, "submit==true erforderlich.");
    }

    const token: string = body?.token || "";
    const salesEmail: string | undefined = body?.salesEmail || undefined;
    // signer ist optional – kann für Logging/Verbesserung genutzt werden
    const signer: { name?: string; email?: string } = body?.signer || {};

    if (!token) return err(400, "Fehlender Token.");

    // Token decodieren
    const decoded = decodeOrderToken(token);
    if (!decoded.ok) {
      return err(400, "Token ungültig/unsupported.", { reason: decoded.error });
    }

    // Payload normalisieren
    const norm = normalizeOrderPayload(decoded.data);
    if (!norm.ok) {
      return err(400, "Orderdaten unvollständig/ungültig: " + norm.error, { missing: norm.missing });
    }

    const order = norm.data;

    // (Optional) Hier könntest du persistieren/signieren/etc.
    // z.B. await saveOrder(order, signer)
    // z.B. await signOrder(order)

    // E-Mail vorbereiten
    const subject = `xVoice UC – Auftragsbestätigung ${order.offerId}`;
    const html = renderEmailHtml("Auftragsbestätigung", order);

    // Empfänger bestimmen
    const recipients = new Set<string>();
    // Sammelpostfach intern
    recipients.add("vertrieb@xvoice-uc.de");
    // optional Sales
    if (salesEmail) recipients.add(salesEmail);
    // Kunde aus den Orderdaten (falls vorhanden)
    if (order.customer?.email) recipients.add(order.customer.email);

    // Versand via Resend (wenn möglich, aber nicht blocking)
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
      signer: signer?.email ? { email: signer.email, name: signer.name } : undefined,
    });
  } catch (e: any) {
    console.error("[place-order] Unhandled error:", e);
    return err(500, "Interner Fehler beim Verarbeiten der Bestellung.");
  }
}

export async function GET() {
  return err(405, "Method Not Allowed");
}
