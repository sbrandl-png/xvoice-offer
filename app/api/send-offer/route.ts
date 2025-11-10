// app/api/send-offer/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  // simple but robust-enough validator
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      meta,
      offerHtml,
      customer,
      recipients,          // z.B. [customer.email, salesEmail] aus der App
      salesperson,         // { name, email, phone } – wir nehmen salesperson.email zusätzlich
    } = body || {};

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Server: RESEND_API_KEY fehlt." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    // Absender/Reply-To
    const from = `xVoice Angebote <angebot@xvoice-one.de>`;
    const salesSigEmail = salesperson?.email && String(salesperson.email).trim();
    const replyTo = isValidEmail(salesSigEmail) ? salesSigEmail : "vertrieb@xvoice-uc.de";

    // Empfänger zusammenbauen (Kunde/Vertrieb aus payload + automatisch salesperson.email)
    const baseList = Array.isArray(recipients) ? recipients : [];
    const withSalesSig = isValidEmail(salesSigEmail) ? [...baseList, salesSigEmail] : baseList;

    // Deduplizieren & invalides entfernen
    const to = Array.from(
      new Set(withSalesSig.filter(isValidEmail))
    );

    // Fallback, falls nichts übrig bleibt
    if (to.length === 0) {
      to.push("vertrieb@xvoice-uc.de");
    }

    const subject =
      (meta && meta.subject) || "Ihr individuelles xVoice UC Angebot";

    if (!offerHtml || typeof offerHtml !== "string") {
      return NextResponse.json(
        { ok: false, error: "offerHtml fehlt oder ist ungültig." },
        { status: 400 }
      );
    }

    await resend.emails.send({
      from,
      to,
      reply_to: replyTo,
      subject,
      html: offerHtml,
      // Optional: Tags/Headers
      // headers: { "X-Campaign": "xvoice-offer" },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, info: "send-offer endpoint ready" });
}
