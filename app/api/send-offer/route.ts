// app/api/send-offer/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";           // Server-Runtime
export const dynamic = "force-dynamic";    // keine Prerender-Versuche

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      meta,
      offerHtml,
      customer,
      recipients,
      salesperson,
      // ... weitere Felder falls nötig
    } = body || {};

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Kein harter Throw – sauberer 500-Response, damit der Build nicht scheitert
      return NextResponse.json(
        { ok: false, error: "Server: RESEND_API_KEY fehlt." },
        { status: 500 }
      );
    }

    // Resend-Client ERST JETZT erzeugen (im Handler, nicht global)
    const resend = new Resend(apiKey);

    // Absender/Reply-To wie gewünscht:
    const from = `xVoice Angebote <angebot@xvoice-one.de>`;
    const replyTo = "vertrieb@xvoice-uc.de";

    const to: string[] =
      Array.isArray(recipients) && recipients.length
        ? recipients
        : ["vertrieb@xvoice-uc.de"];

    const subject =
      (meta && meta.subject) || "Ihr individuelles xVoice UC Angebot";

    // Minimal-Validierung
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
      // optional:
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

// Optional: GET als Fallback/Healthcheck
export async function GET() {
  return NextResponse.json({ ok: true, info: "send-offer endpoint ready" });
}
