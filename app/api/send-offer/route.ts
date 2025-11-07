import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { offerHtml, subject, recipients, salesperson } = body || {};

    // 1. API-Key prüfen
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Server: RESEND_API_KEY fehlt." },
        { status: 500 }
      );
    }

    // 2. Eingaben prüfen
    if (!offerHtml || typeof offerHtml !== "string") {
      return NextResponse.json(
        { ok: false, error: "Fehler: Angebotsinhalt (HTML) fehlt oder ist ungültig." },
        { status: 400 }
      );
    }

    const to =
      Array.isArray(recipients) && recipients.length > 0
        ? recipients
        : ["vertrieb@xvoice-uc.de"]; // Fallback

    const from = "xVoice Angebote <angebot@xvoice-one.de>";
    const replyTo = "vertrieb@xvoice-uc.de";
    const bcc = ["vertrieb@xvoice-uc.de"];

    const mailSubject = subject || "Ihr individuelles xVoice UC Angebot";

    // 3. Resend initialisieren
    const resend = new Resend(apiKey);

    // 4. Versand
    const result = await resend.emails.send({
      from,
      to,
      bcc,
      reply_to: replyTo,
      subject: mailSubject,
      html: offerHtml,
      tags: [
        { name: "project", value: "xvoice-offer" },
        { name: "salesperson", value: salesperson || "unbekannt" },
      ],
    });

    // Neu: Rückgabe kompatibel mit aktueller Resend-API
    const emailId = result?.data?.id ?? null;

    return NextResponse.json({
      ok: true,
      id: emailId,
      message: "E-Mail erfolgreich übermittelt.",
    });
  } catch (err: any) {
    console.error("❌ SEND-OFFER ERROR:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Unbekannter Fehler beim E-Mail-Versand.",
      },
      { status: 500 }
    );
  }
}

// Optionaler GET-Endpoint zum Healthcheck
export async function GET() {
  return NextResponse.json({ ok: true, info: "send-offer endpoint ready" });
}
