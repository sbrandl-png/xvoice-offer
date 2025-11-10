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

  const monthly = Array.isArray(p.monthlyRows) ? p.monthlyRows : (p.monthly || p.recurring || []);
  const oneTime = Array.isArray(p.oneTimeRows) ? p.oneTimeRows : (p.oneTime || p.setup || []);
  const vat = typeof p.vatRate === "number" ? p.vatRate : (typeof p.vat === "number" ? p.vat : 0.19);

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

// optionaler HS256-Signer (für interne Bestellnummern/Weitergabe)
function signToken(payload: object): string {
  const header = { alg: "HS256", typ: "JWT" };
  const b64url = (buf: Buffer | string) =>
    Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const secret = process.env.JWT_SECRET || "";
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));

  if (!secret) {
    // Fallback: unsigniert – nur verwenden, wenn Link-Sicherheit nicht kritisch ist
    return `${h}.${p}.`;
  }

  const data = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${data}.${sig}`;
}

// ===== API =====
export async function POST(req: NextRequest) {
  // Erwartet: { submit: boolean, token?: string, order?: object, signer?: {name,email}, accept?: boolean, salesEmail?: string }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body fehlt oder ist kein gültiges JSON." }, { status: 400 });
  }

  const { submit, token, order, signer, accept, salesEmail } = body || {};
  if (!submit) {
    return NextResponse.json({ ok: false, error: "submit==true erforderlich." }, { status: 400 });
  }
  if (accept === false) {
    return NextResponse.json({ ok: false, error: "Bestätigung (AGB/Beauftragung) nicht erteilt." }, { status: 400 });
  }

  // 1) Order ermitteln (aus order oder token)
  let payload: OrderPayload | null = null;

  if (order) {
    payload = normalize(order);
  } else if (token) {
    const decoded = decodeJwtLoose(token);
    payload = normalize(decoded);
  }

  if (!payload) {
    return NextResponse.json(
      { ok: false, error: "Orderdaten unlesbar. Bitte gültiges 'order' Objekt oder 'token' übergeben." },
      { status: 400 }
    );
  }

  // 2) Expiry prüfen – optional
  if (payload.exp && Math.floor(Date.now() / 1000) > Number(payload.exp)) {
    return NextResponse.json({ ok: false, error: "Token/Angebot abgelaufen." }, { status: 400 });
  }

  if (!isOrderPayload(payload)) {
    // detaillierter Grund
    const reasons: string[] = [];
    if (typeof payload.offerId !== "string") reasons.push("offerId");
    if (!Array.isArray(payload.monthlyRows)) reasons.push("monthlyRows");
    if (!Array.isArray(payload.oneTimeRows)) reasons.push("oneTimeRows");
    if (typeof payload.vatRate !== "number") reasons.push("vatRate");
    if (typeof payload.createdAt !== "number") reasons.push("createdAt");
    return NextResponse.json(
      { ok: false, error: `Orderdaten unvollständig: ${reasons.join(", ")}` },
      { status: 400 }
    );
  }

  // 3) (Beispiel) interne Referenz generieren
  const orderRef = `XVO-${payload.offerId}-${Date.now().toString(36).toUpperCase()}`;

  // 4) Mails versenden (Kunde, Vertrieb, vertrieb@xvoice-uc.de)
  // ---- hier ggf. Resend, SMTP o.ä. einhängen; unten nur Stub/Logik ----
  const recipients = [
    payload.customer.email,          // Kunde
    salesEmail || undefined,         // Vertrieb (optional aus UI)
    "vertrieb@xvoice-uc.de",         // internes Postfach
  ].filter(Boolean) as string[];

  // Render kleines Textresümee (du hast separate HTML-Templates – hier nur schnell & stabil):
  const sum = (rows: OrderRow[]) => rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const net = sum(payload.monthlyRows) + sum(payload.oneTimeRows);
  const vat = net * payload.vatRate;
  const gross = net + vat;

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
    `Wir melden uns für das Kick-off. Optional können Sie bereits hier einen Termin buchen:`,
    `https://calendly.com/s-brandl-xvoice-uc/xvoice-uc-kickoff-meeting`,
  ].join("\n");

  // Stub Versand (ersetze durch deinen Mailer / Resend):
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

  // 5) Antwort an Frontend
  return NextResponse.json({
    ok: true,
    orderRef,
  });
}
