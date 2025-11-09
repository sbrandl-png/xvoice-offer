// app/api/place-order/route.ts
import { NextResponse } from "next/server";
import { verifyOrderToken } from "@/lib/orderToken";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let token = "";
    let company = "", contact = "", email = "", phone = "", accept = "";

    if (contentType.includes("application/json")) {
      const j = await req.json();
      token   = j.token || "";
      company = j.company || "";
      contact = j.contact || "";
      email   = j.email || "";
      phone   = j.phone || "";
      accept  = j.accept ? "on" : "";
    } else {
      const form = await req.formData();
      token   = String(form.get("token") || "");
      company = String(form.get("company") || "");
      contact = String(form.get("contact") || "");
      email   = String(form.get("email") || "");
      phone   = String(form.get("phone") || "");
      accept  = String(form.get("accept") || "");
    }

    if (!token) {
      return NextResponse.json({ ok: false, error: "Token fehlt." }, { status: 400 });
    }
    if (!company || !contact || !email || accept !== "on") {
      return NextResponse.json({ ok: false, error: "Bitte Formular vollständig ausfüllen und bestätigen." }, { status: 400 });
    }

    // Token prüfen & Payload lesen
    const payload = verifyOrderToken(token);

    // → MAKE: Weiterreichen
    const hook = process.env.MAKE_WEBHOOK_URL;
    if (hook) {
      await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "xvoice-offer-order",
          offerId: payload.offerId,
          vatRate: payload.vatRate,
          customer: {
            company, contact, email, phone,
          },
          salesperson: payload.salesperson || {},
          monthlyRows: payload.monthlyRows,
          oneTimeRows: payload.oneTimeRows,
          createdAt: payload.createdAt,
          submittedAt: Date.now(),
        }),
      });
    }

    // → RESEND: Eingangsbestätigung
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      const to = [email].concat(payload.salesperson?.email ? [payload.salesperson.email] : []);
      await resend.emails.send({
        from: `xVoice Aufträge <auftrag@xvoice-one.de>`,
        to,
        subject: `Bestelleingang – Angebot ${payload.offerId}`,
        html: `
          <p>Guten Tag ${contact},</p>
          <p>vielen Dank für Ihre verbindliche Bestellung. Wir haben den Auftrag erhalten und melden uns kurzfristig mit der Auftragsbestätigung.</p>
          <p><strong>Firma:</strong> ${company}<br/>
             <strong>E-Mail:</strong> ${email}<br/>
             <strong>Telefon:</strong> ${phone}</p>
          <p>Referenz: Angebot ${payload.offerId}</p>
          <p>Mit freundlichen Grüßen<br/>xVoice UC</p>
        `.trim(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
