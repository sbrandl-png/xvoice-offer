// app/api/place-order/route.ts
import { NextRequest, NextResponse } from "next/server";

// ---- Helpers: base64url, HMAC, JWT sign/verify (HS256) -----------------
function b64url(input: Uint8Array | string) {
  const b64 = typeof input === "string"
    ? Buffer.from(input, "utf8").toString("base64")
    : Buffer.from(input).toString("base64");
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string) {
  const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}
async function hmacSha256(key: Uint8Array, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

type OrderRow = { sku: string; name: string; quantity: number; unit: number; total: number };
type OrderPayload = {
  offerId: string;
  customer: { company?: string; contact?: string; email?: string; phone?: string };
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
  vatRate: number;
  createdAt: number;
  // optional: exp, iat (falls vom Signieren gesetzt)
  exp?: number;
  iat?: number;
};

function isOrderPayload(v: any): v is OrderPayload {
  return !!v
    && typeof v.offerId === "string"
    && v.customer && typeof v.customer === "object"
    && Array.isArray(v.monthlyRows) && Array.isArray(v.oneTimeRows)
    && typeof v.vatRate === "number"
    && typeof v.createdAt === "number";
}

const BRAND = {
  primary: "#ff4e00",
  headerBg: "#000000",
  headerFg: "#ffffff",
  logoUrl: "https://onecdn.io/media/b7399880-ec13-4366-a907-6ea635172076/md2x",
};
const COMPANY = {
  legal: "xVoice UC UG (Haftungsbeschränkt)",
  street: "Peter-Müller-Straße 3",
  zip: "40468",
  city: "Düsseldorf",
  phone: "+49 211 955 861 0",
  email: "vertrieb@xvoice-uc.de",
  web: "www.xvoice-uc.de",
  register: "Amtsgericht Siegburg, HRB 19078",
};

function eur(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);
}

function rowsTable(rows: OrderRow[]) {
  const head = `
    <thead>
      <tr>
        <th style="text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555;white-space:nowrap">Position</th>
        <th style="text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555;white-space:nowrap">Menge</th>
        <th style="text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555;white-space:nowrap">Einzelpreis</th>
        <th style="text-align:left;padding:10px 8px;font-size:12px;border-bottom:1px solid #eee;color:#555;white-space:nowrap">Summe</th>
      </tr>
    </thead>`;
  const body = rows.map(r => `
    <tr>
      <td style="padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5">${r.name} (${r.sku})</td>
      <td style="padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5">${r.quantity}</td>
      <td style="padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5">${eur(r.unit)}</td>
      <td style="padding:10px 8px;font-size:13px;border-bottom:1px solid #f1f1f5"><strong>${eur(r.total)}</strong></td>
    </tr>`).join("");
  return `<table width="100%" style="border-collapse:collapse;margin-top:6px">${head}<tbody>${body}</tbody></table>`;
}

function buildConfirmationHtml(payload: OrderPayload, signer: { name: string; email: string }) {
  const s = {
    body: "margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#111",
    container: "max-width:720px;margin:0 auto;padding:24px",
    card: "background:#ffffff;border-radius:14px;padding:0;border:1px solid #e9e9ef;overflow:hidden",
    header: `background:${BRAND.headerBg};color:${BRAND.headerFg};padding:16px 20px;`,
    headerTable: "width:100%;border-collapse:collapse",
    logo: "display:block;height:64px;object-fit:contain",
    accent: `height:3px;background:${BRAND.primary};`,
    inner: "padding:20px",
    h1: `margin:0 0 8px 0;font-size:22px;color:#111`,
    p: "margin:0 0 10px 0;font-size:14px;color:#333;line-height:1.6",
    pSmall: "margin:0 0 8px 0;font-size:12px;color:#666;line-height:1.5",
  };

  const mNet = payload.monthlyRows.reduce((a, r) => a + r.total, 0);
  const oNet = payload.oneTimeRows.reduce((a, r) => a + r.total, 0);
  const vatM  = mNet * payload.vatRate;
  const vatO  = oNet * payload.vatRate;

  return `<!DOCTYPE html><html><head><meta charSet="utf-8"/></head>
  <body style="${s.body}">
    <div style="${s.container}">
      <div style="${s.card}">
        <div style="${s.header}">
          <table style="${s.headerTable}"><tr><td><img src="${BRAND.logoUrl}" alt="xVoice Logo" style="${s.logo}" /></td></tr></table>
        </div>
        <div style="${s.accent}"></div>
        <div style="${s.inner}">
          <h1 style="${s.h1}">Auftragsbestätigung – ${payload.offerId}</h1>
          <p style="${s.p}">Vielen Dank! Ihre Bestellung ist bei uns eingegangen.</p>
          <p style="${s.p}"><strong>Kunde:</strong> ${payload.customer.company || "-"}${payload.customer.contact ? " · " + payload.customer.contact : ""}</p>
          <p style="${s.pSmall}"><strong>Unterzeichnet von:</strong> ${signer.name} &lt;${signer.email}&gt;</p>

          <h3 style="margin:18px 0 6px 0;font-size:16px;color:#111">Monatliche Positionen</h3>
          ${rowsTable(payload.monthlyRows)}

          <div style="margin-top:10px;font-size:13px">
            <div>Zwischensumme (netto): <strong>${eur(mNet)}</strong></div>
            <div>zzgl. USt. (${Math.round(payload.vatRate*100)}%): <strong>${eur(vatM)}</strong></div>
            <div>Bruttosumme monatlich: <strong>${eur(mNet + vatM)}</strong></div>
          </div>

          <h3 style="margin:18px 0 6px 0;font-size:16px;color:#111">Einmalige Positionen</h3>
          ${rowsTable(payload.oneTimeRows)}
          <div style="margin-top:10px;font-size:13px">
            <div>Zwischensumme (netto): <strong>${eur(oNet)}</strong></div>
            <div>zzgl. USt. (${Math.round(payload.vatRate*100)}%): <strong>${eur(vatO)}</strong></div>
            <div>Bruttosumme einmalig: <strong>${eur(oNet + vatO)}</strong></div>
          </div>

          <p style="${s.pSmall};margin-top:16px">Hinweis: Diese Bestätigung enthält alle relevanten Bestelldaten. Die Bereitstellung/Onboarding stimmen wir im Anschluss mit Ihnen ab.</p>

          <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">
            <p style="${s.pSmall}">${COMPANY.legal}</p>
            <p style="${s.pSmall}">${COMPANY.street}, ${COMPANY.zip} ${COMPANY.city}</p>
            <p style="${s.pSmall}">Tel. ${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}</p>
            <p style="${s.pSmall}">${COMPANY.register}</p>
            <p style="${s.pSmall}">© ${new Date().getFullYear()} xVoice UC · Impressum & Datenschutz auf xvoice-uc.de</p>
          </div>
        </div>
      </div>
    </div>
  </body></html>`;
}

// ---- Mail via bestehendem /api/send-offer -------------------------------
async function sendConfirmationMail(recipients: string[], subject: string, html: string, payload: OrderPayload, signer: { name: string; email: string }) {
  // Wir nutzen dein vorhandenes Mail-API (/api/send-offer).
  const body = {
    meta: { subject },
    offerHtml: html,
    customer: payload.customer,
    monthlyRows: payload.monthlyRows,
    oneTimeRows: payload.oneTimeRows,
    totals: {
      monthly: {
        netList: payload.monthlyRows.reduce((a, r) => a + r.total, 0), // Listenpreise sind hier identisch zu offer
        netOffer: payload.monthlyRows.reduce((a, r) => a + r.total, 0),
      },
      oneTime: {
        netList: payload.oneTimeRows.reduce((a, r) => a + r.total, 0),
        netOffer: payload.oneTimeRows.reduce((a, r) => a + r.total, 0),
      },
    },
    salesperson: { name: signer.name, email: signer.email, phone: "" },
    recipients,
  };

  // POST zuerst, bei 405 Fallback auf GET (kompatibel zu deiner bestehenden Helper-Logik)
  const url = new URL("/api/send-offer", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").toString();
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
  } catch (err: any) {
    if (/405|UnsupportedHttpVerb/i.test(String(err?.message || err))) {
      const qs = new URLSearchParams({ data: JSON.stringify({ subject, to: recipients.join(","), company: payload.customer.company || "" }) }).toString();
      const res2 = await fetch(`${url}?${qs}`, { method: "GET" });
      if (!res2.ok) throw new Error(await res2.text());
    } else {
      throw err;
    }
  }
}

// ---- JWT sign/verify -----------------------------------------------------
async function signJwtHS256(payload: any, secret: string, kid = "xv1", ttlSeconds = 48 * 3600) {
  const nowSec = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: nowSec, exp: nowSec + ttlSeconds };
  const header = { alg: "HS256", typ: "JWT", kid };
  const p1 = b64url(JSON.stringify(header));
  const p2 = b64url(JSON.stringify(full));
  const data = `${p1}.${p2}`;
  const sig = await hmacSha256(new TextEncoder().encode(secret), data);
  return `${data}.${b64url(sig)}`;
}

async function verifyJwtHS256(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [h64, p64, s64] = parts;
  const data = `${h64}.${p64}`;
  const expected = await hmacSha256(new TextEncoder().encode(secret), data);
  const got = b64urlDecode(s64);
  if (Buffer.compare(Buffer.from(expected), Buffer.from(got)) !== 0) throw new Error("Bad signature");
  const payload = JSON.parse(b64urlDecode(p64).toString("utf8"));
  return payload;
}

// ---- API Route -----------------------------------------------------------
export async function POST(req: NextRequest) {
  const ORDER_SECRET = process.env.ORDER_SECRET;
  if (!ORDER_SECRET) {
    return NextResponse.json({ ok: false, error: "ORDER_SECRET fehlt." }, { status: 500 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  // A) Nur signieren (wird aus page.tsx beim Versand des Angebots genutzt)
  if (body?.signOnly && body?.payload) {
    if (!isOrderPayload(body.payload)) {
      return NextResponse.json({ ok: false, error: "Ungültiger Payload zum Signieren." }, { status: 400 });
    }
    const token = await signJwtHS256(body.payload, ORDER_SECRET, "xv1");
    return NextResponse.json({ ok: true, token });
  }

  // B) Bestellung absenden
  if (body?.submit) {
    const token: string | undefined = body.token;
    const accept: boolean = !!body.accept;
    const signer = body?.signer || {};
    const salesEmail: string | undefined = body?.salesEmail; // optional aus Order-Page

    if (!token) return NextResponse.json({ ok: false, error: "Fehlender Token." }, { status: 400 });
    if (!accept) return NextResponse.json({ ok: false, error: "Bitte AGB/Datenschutz bestätigen." }, { status: 400 });
    if (!signer?.name || !signer?.email) return NextResponse.json({ ok: false, error: "Signer unvollständig." }, { status: 400 });

    // Token prüfen
    let payload: any;
    try {
      payload = await verifyJwtHS256(token, ORDER_SECRET);
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: "Token ungültig: " + String(e?.message || e) }, { status: 400 });
    }
    if (!isOrderPayload(payload)) {
      return NextResponse.json({ ok: false, error: "Payload im Token ist ungültig." }, { status: 400 });
    }
    // optional exp-Check, nur wenn vorhanden (ältere Tokens ohne exp nicht brechen)
    if (payload.exp && Math.floor(Date.now() / 1000) > Number(payload.exp)) {
      return NextResponse.json({ ok: false, error: "Token abgelaufen." }, { status: 400 });
    }

    // Auftragsbestätigung bauen & versenden
    const html = buildConfirmationHtml(payload, signer);
    const recipients = Array.from(
      new Set(
        [
          payload.customer.email,          // Kunde
          signer.email,                    // Vertriebsmitarbeiter (oder Betreuer)
          salesEmail,                      // optional zusätzlich (aus der Order-Page)
          COMPANY.email,                   // zentral: vertrieb@xvoice-uc.de
        ].filter(Boolean) as string[]
      )
    );

    try {
      await sendConfirmationMail(
        recipients,
        `Auftragsbestätigung – ${payload.offerId}`,
        html,
        payload,
        signer
      );
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: "E-Mail Versand fehlgeschlagen: " + String(err?.message || err) }, { status: 500 });
    }

    // Hier könntest du zusätzlich CRM/ERP/Webhooks triggern

    return NextResponse.json({ ok: true, status: "order-accepted", offerId: payload.offerId, recipients });
  }

  // C) Optional: Logging eines Order-Intents
  if (body?.orderIntent && body?.token) {
    // nur validieren, kein Versand
    try {
      const p = await verifyJwtHS256(body.token, ORDER_SECRET);
      if (!isOrderPayload(p)) throw new Error("Bad payload");
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: "OrderIntent: Token ungültig: " + String(e?.message || e) }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status: "intent-logged" });
  }

  return NextResponse.json({ ok: false, error: "Unsupported payload." }, { status: 400 });
}
