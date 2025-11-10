// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ===== Types =====
type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  unit: number;   // Netto-Einzelpreis
  total: number;  // Netto-Zeilenpreis
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
  vatRate: number;   // z.B. 0.19
  createdAt: number; // ms epoch
  exp?: number;      // optional, sec epoch
};

// ===== Helpers =====
const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

function decodeJwtLoose(token: string): any | null {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payloadB64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// tolerantes Normalisieren (akzeptiert Aliasse)
function normalize(p: any): OrderPayload | null {
  if (!p || typeof p !== "object") return null;

  const monthly =
    Array.isArray(p.monthlyRows) ? p.monthlyRows : (p.monthly || p.recurring || []);
  const oneTime =
    Array.isArray(p.oneTimeRows) ? p.oneTimeRows : (p.oneTime || p.setup || []);
  const vat =
    typeof p.vatRate === "number" ? p.vatRate : (typeof p.vat === "number" ? p.vat : 0.19);

  if (!p.offerId || !Array.isArray(monthly) || !Array.isArray(oneTime)) return null;

  return {
    offerId: String(p.offerId),
    customer: p.customer || {},
    monthlyRows: monthly,
    oneTimeRows: oneTime,
    vatRate: vat,
    createdAt: Number(p.createdAt || Date.now()),
    exp: typeof p.exp === "number" ? p.exp : undefined,
  };
}

function isOrderPayload(o: any): o is OrderPayload {
  return (
    o &&
    typeof o.offerId === "string" &&
    o.customer &&
    Array.isArray(o.monthlyRows) &&
    Array.isArray(o.oneTimeRows) &&
    typeof o.vatRate === "number" &&
    typeof o.createdAt === "number"
  );
}

function signToken(payload: object): string {
  const header = { alg: "HS256", typ: "JWT" };
  const b64url = (buf: Buffer | string) =>
    Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const secret = process.env.JWT_SECRET || "";
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));

  if (!secret) return `${h}.${p}.`;

  const data = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${data}.${sig}`;
}

// ===== API =====
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body fehlt oder ist kein gültiges JSON." }, { status: 400 });
  }

  const { submit, token, order, signer, accept, salesEmail } = body || {};
  if (!submit) return NextResponse.json({ ok: false, error: "submit==true erforderlich." }, { status: 400 });
  if (accept === false) {
    return NextResponse.json({ ok: false, error: "Bestätigung (AGB/Beauftragung) nicht erteilt." }, { status: 400 });
  }

  // 1) Kandidat ermitteln (roh), dann normalisieren
  const candidate: any = order ?? (token ? decodeJwtLoose(token) : null);
  const normalized = normalize(candidate);

  if (!normalized) {
    // Detail-Feedback auf Basis des ROH-Objekts (nicht 'normalized')
    const p: any = candidate ?? {};
    const reasons: string[] = [];
    if (typeof p.offerId !== "string") reasons.push("offerId");
    const monthly = Array.isArray(p.monthlyRows) ? p.monthlyRows : (p.monthly || p.recurring);
    const oneTime = Array.isArray(p.oneTimeRows) ? p.oneTimeRows : (p.oneTime || p.setup);
    if (!Array.isArray(monthly)) reasons.push("monthlyRows (oder Alias monthly/recurring)");
    if (!Array.isArray(oneTime)) reasons.push("oneTimeRows (oder Alias oneTime/setup)");
    if (!(typeof p.vatRate === "number" || typeof p.vat === "number")) reasons.push("vatRate (oder Alias vat)");
    return NextResponse.json(
      { ok: false, error: `Orderdaten unvollständig/ungültig: ${reasons.join(", ")}` },
      { status: 400 }
    );
  }

  // 2) Optionales Ablauf prüfen
  if (normalized.exp && Math.floor(Date.now() / 1000) > Number(normalized.exp)) {
    return NextResponse.json({ ok: false, error: "Token/Angebot abgelaufen." }, { status: 400 });
  }

  // 3) Finales Schema absichern
  if (!isOrderPayload(normalized)) {
    return NextResponse.json({ ok: false, error: "Orderdaten fehlerhaft (Schema)." }, { status: 400 });
  }

  const payload = normalized;

  // 4) Interne Referenz
  const orderRef = `XVO-${payload.offerId}-${Date.now().toString(36).toUpperCase()}`;

  // 5) Summen
  const sum = (rows: OrderRow[]) => rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const net = sum(payload.monthlyRows) + sum(payload.oneTimeRows);
  const vat = net * payload.vatRate;
  const gross = net + vat;

  // 6) E-Mail-Empfänger
  const recipients = [
    payload.customer.email,
    salesEmail || undefined,
    "vertrieb@xvoice-uc.de",
  ].filter(Boolean) as string[];

  const subject = `Auftragsbestätigung – ${payload.customer.company || payload.offerId} – ${orderRef}`;
  const text = [
    `Vielen Dank für Ihre Bestellung.`,
    ``,
    `Referenz: ${orderRef}`,
    `Angebot: ${payload.offerId}`,
    ``,
    `Firma: ${payload.customer.company || "-"}`,
    `Kontakt: ${payload.customer.contact || "-"}`,
    `E-Mail: ${payload.customer.email || "-"}`,
    `Telefon: ${payload.customer.phone || "-"}`,
    ``,
    `Gesamt netto: ${eur(net)}`,
    `zzgl. USt.:   ${eur(vat)}`,
    `Gesamt brutto:${eur(gross)}`,
    ``,
    `Kick-off-Gespräch buchen:`,
    `https://calendly.com/s-brandl-xvoice-uc/xvoice-uc-kickoff-meeting`,
  ].join("\n");

  // 7) Versand (Resend/SMTP) – Stub
  const key = process.env.RESEND_API_KEY;
  if (key) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "xVoice UC <no-reply@xvoice-uc.de>",
        to: recipients,
        subject,
        text,
      }),
    }).catch(() => {});
  } else {
    console.log("[PLACE-ORDER] Mail (FAKE):", { recipients, subject, text });
  }

  return NextResponse.json({ ok: true, orderRef });
}
