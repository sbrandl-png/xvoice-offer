import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { offerHtml, subject, recipients, salesperson } = body || {};

    // === 1. Umgebungsvariable prüfen ===
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Server: RESEND_API_KEY fehlt." },
        { status: 500 }
      );
    }

    // === 2. E-Mail-Validierung ===
    if (!offerHtml || typeof offerHtml !== "string") {
      return NextResponse.json(
        { ok: false, error: "Fehler: Angebotsinhalt (HTML) fehlt oder ist ungültig." },
        { status: 400 }
      );
    }

    // === 3. Empfänger bestimmen ===
    const to =
      Array.isArray(recipients) && recipients.length > 0
        ? recipients
        : ["vertrieb@xvoice-uc.de"]; // Fallback

    const from = "xVoice Angebote <angebot@xvoice-one.de>";
    const replyTo = "vertrieb@xvoice-uc.de";
    const bcc = ["vertrieb@xvoice-uc.de"];

    const mailSubject =
      subject || "Ihr individuelles xVoice UC Angebot";

    // === 4. Resend-Client initialisieren ===
    const resend = new Resend(apiKey);

    // === 5. Versand ausführen ===
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

    // === 6. Rückgabe an Frontend ===
    return NextResponse.json({
      ok: true,
      id: result?.id ?? null,
      message: "E-Mail erfolgreich übermittelt.",
    });
  } catch (err: any) {
    console.error("❌ SEND-OFFER ERROR:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err?.message || "Unbekannter Fehler beim E-Mail-Versand.",
      },
      { status: 500 }
    );
  }
}

// Optionaler GET-Handler für Healthcheck
export async function GET() {
  return NextResponse.json({ ok: true, info: "send-offer endpoint ready" });
}
