// app/api/send-offer/route.ts
import { NextRequest, NextResponse } from "next/server";

// ---- JSON helpers
const ok = (data: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: true, ...data }, { status: 200 });
const err = (status: number, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });

// ---- tolerant submit
function isTruthy(v: unknown) {
  return v === true || v === "true" || v === 1 || v === "1";
}

// ---- token decoding (JSON oder base64url(JSON))
function b64urlToStr(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  // @ts-ignore Node runtime: Buffer vorhanden
  return Buffer.from(b64 + pad, "base64").toString("utf-8");
}
function safeJSON<T=any>(s: string): {ok:true,data:T}|{ok:false,error:string}{
  try { return { ok:true, data: JSON.parse(s) }; }
  catch(e:any){ return { ok:false, error: e?.message || "JSON parse error" }; }
}
function decodeToken(raw: string): {ok:true,data:any}|{ok:false,error:string} {
  if (!raw || typeof raw !== "string") return { ok:false, error:"leer/ungültig" };
  if (raw.trim().startsWith("{")) {
    const p = safeJSON(raw); if (p.ok) return { ok:true, data: p.data };
  }
  try {
    const p = safeJSON(b64urlToStr(raw)); if (p.ok) return { ok:true, data: p.data };
  } catch {}
  return { ok:false, error:"kein JSON/base64url(JSON)" };
}

// ---- Types
type Row = { sku: string; name: string; quantity: number; unit: number; total?: number };
type Customer = { company?: string; contact?: string; email?: string; phone?: string };
type OfferLike = {
  offerId?: string;
  customer?: Customer;
  monthlyRows?: Row[];
  oneTimeRows?: Row[];
  monthly?: Row[];
  recurring?: Row[];
  oneTime?: Row[];
  setup?: Row[];
  vatRate?: number;
  vat?: number;
  createdAt?: number;
  [k: string]: any;
};

// ---- Normalisierung
function normalizeOffer(raw: any): 
  | { ok:true, data:{ offerId:string; customer:Customer; monthlyRows:Row[]; oneTimeRows:Row[]; vatRate:number; createdAt?:number } }
  | { ok:false, error:string; missing?:string[] } {
  const p: OfferLike = raw ?? {};
  const monthlyRows = p.monthlyRows ?? p.monthly ?? p.recurring;
  const oneTimeRows = p.oneTimeRows ?? p.oneTime ?? p.setup;
  const vatRate = typeof p.vatRate === "number" ? p.vatRate : (typeof p.vat === "number" ? p.vat : undefined);

  const missing: string[] = [];
  if (!p.offerId) missing.push("offerId");
  if (!Array.isArray(monthlyRows)) missing.push("monthlyRows (oder monthly/recurring)");
  if (!Array.isArray(oneTimeRows)) missing.push("oneTimeRows (oder oneTime/setup)");
  if (typeof vatRate !== "number") missing.push("vatRate (oder vat)");

  if (missing.length) return { ok:false, error:"Offer unvollständig/ungültig", missing };

  return {
    ok:true,
    data: {
      offerId: p.offerId!,
      customer: p.customer ?? {},
      monthlyRows: monthlyRows as Row[],
      oneTimeRows: oneTimeRows as Row[],
      vatRate: vatRate as number,
      createdAt: p.createdAt,
    }
  };
}

// ---- E-Mail Rendering (Angebot)
function renderOfferHtml(offer: {
  offerId: string; customer: Customer; monthlyRows: Row[]; oneTimeRows: Row[]; vatRate: number;
}) {
  const € = (n:number) => new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(n);
  const sum = (rows:Row[]) => rows.reduce((s,r)=>s+(r.total ?? r.quantity*r.unit),0);

  const netMonthly = sum(offer.monthlyRows);
  const netOT = sum(offer.oneTimeRows);
  const grossMonthly = netMonthly * (1 + offer.vatRate);
  const grossOT = netOT * (1 + offer.vatRate);

  const tr = (r:Row) =>
    `<tr><td>${r.sku}</td><td>${r.name}</td><td style="text-align:right">${r.quantity}</td><td style="text-align:right">${€(r.unit)}</td><td style="text-align:right">${€(r.total ?? r.quantity*r.unit)}</td></tr>`;

  return `
  <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111">
    <h2 style="margin:0 0 12px 0">Ihr xVoice UC Angebot · ${offer.offerId}</h2>
    <p style="margin:0 0 6px 0"><strong>Kunde:</strong> ${offer.customer?.company ?? "-"} · <strong>Kontakt:</strong> ${offer.customer?.contact ?? "-"}</p>
    <p style="margin:0 16px 16px 0"><strong>E-Mail:</strong> ${offer.customer?.email ?? "-"} · <strong>Telefon:</strong> ${offer.customer?.phone ?? "-"}</p>

    <h3 style="margin:16px 0 8px 0">Monatliche Positionen (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead><tr style="background:#f6f6f6"><th>SKU</th><th>Bezeichnung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzel</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${offer.monthlyRows.map(tr).join("")}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td><td style="text-align:right"><strong>${€(netMonthly)}</strong></td></tr></tfoot>
    </table>

    <h3 style="margin:16px 0 8px 0">Einmalige Positionen (netto)</h3>
    <table cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #eee">
      <thead><tr style="background:#f6f6f6"><th>SKU</th><th>Bezeichnung</th><th style="text-align:right">Menge</th><th style="text-align:right">Einzel</th><th style="text-align:right">Summe</th></tr></thead>
      <tbody>${offer.oneTimeRows.map(tr).join("")}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right"><strong>Zwischensumme</strong></td><td style="text-align:right"><strong>${€(netOT)}</strong></td></tr></tfoot>
    </table>

    <p style="margin:16px 0 0 0">
      <strong>USt.-Satz:</strong> ${(offer.vatRate*100).toFixed(0)} %<br/>
      <strong>Monatlich brutto:</strong> ${€(grossMonthly)}<br/>
      <strong>Einmalig brutto:</strong> ${€(grossOT)}
    </p>

    <p style="margin:20px 0 0 0;color:#555">Automatisch erstellt vom xVoice Angebots-System.</p>
  </div>`;
}

// ---- Resend Versand
async function sendViaResend(subject:string, html:string, toList:string[], from?:string) {
  const results: Array<{to:string; ok:boolean; error?:string}> = [];
  try {
    const mod: any = await import("resend").catch(()=>null);
    if (!mod?.Resend) return { ok:false, reason:'Resend SDK fehlt (npm i resend)', results };
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { ok:false, reason:"RESEND_API_KEY nicht gesetzt", results };

    const resend = new mod.Resend(apiKey);
    const sender = from || "vertrieb@xvoice-uc.de";

    for (const to of toList.filter(Boolean)) {
      try {
        const { error } = await resend.emails.send({ from: sender, to, subject, html });
        if (error) results.push({ to, ok:false, error: String(error) });
        else results.push({ to, ok:true });
      } catch(e:any){ results.push({ to, ok:false, error: e?.message || String(e) }); }
    }
    const anyFail = results.some(r=>!r.ok);
    return anyFail ? { ok:false, reason:"Teilweise fehlgeschlagen", results } : { ok:true, results };
  } catch(e:any) {
    return { ok:false, reason: e?.message || "Unbekannter Resend-Fehler", results };
  }
}

// ---- ROUTE
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(()=> ({} as any));

    // 1) submit tolerant: default = true (bricht Alt-Clients nicht mehr)
    const submitRaw = body?.submit ?? url.searchParams.get("submit") ?? req.headers.get("x-submit") ?? true;
    if (!isTruthy(submitRaw)) {
      return err(400, "submit==true erforderlich.");
    }

    // 2) Token aus Body, Query, Header oder Cookie
    const token =
      body?.token ||
      url.searchParams.get("token") ||
      req.headers.get("x-offer-token") ||
      req.cookies.get("offerToken")?.value ||
      "";

    if (!token) return err(400, "Fehlender Token.");

    const decoded = decodeToken(token);
    if (!decoded.ok) return err(400, "Token ungültig/unsupported.", { reason: decoded.error });

    // 3) Offer normalisieren/prüfen
    const norm = normalizeOffer(decoded.data);
    if (!norm.ok) return err(400, "Offer unvollständig/ungültig", { missing: norm.missing });

    const offer = norm.data;

    // 4) E-Mail bauen & versenden
    const subject = `xVoice UC – Angebot ${offer.offerId}`;
    const html = renderOfferHtml(offer);

    // Empfänger: Kunde (falls vorhanden) + Vertrieb
    const recipients = new Set<string>(["vertrieb@xvoice-uc.de"]);
    if (offer.customer?.email) recipients.add(offer.customer.email);

    const mail = await sendViaResend(subject, html, Array.from(recipients), "vertrieb@xvoice-uc.de");

    return ok({ message: "Angebot versendet.", offerId: offer.offerId, emails: mail });
  } catch (e:any) {
    console.error("[send-offer] Unhandled:", e);
    return err(500, "Interner Fehler beim Angebotsversand.");
  }
}

export async function GET() {
  return err(405, "Method Not Allowed");
}
