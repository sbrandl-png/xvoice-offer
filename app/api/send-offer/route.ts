import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// === feste Absenderdefinition (Variante A) ===
const resend = new Resend(process.env.RESEND_API_KEY);
const MAIL_FROM_DEFAULT = "xVoice UC <angebot@xvoice-one.de>";
const MAIL_REPLY_TO_DEFAULT = "vertrieb@xvoice-uc.de";

type Payload = {
  meta?: { subject?: string };
  offerHtml?: string;
  recipients?: string[];
  customer?: any;
  lineItems?: any[];
  totals?: any;
  salesperson?: { name?: string; email?: string; phone?: string };
};

// === POST ===
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Payload;

    const subject =
      body?.meta?.subject?.trim() || "Ihr individuelles xVoice UC Angebot";
    const html = body?.offerHtml || "<h1>Kein HTML übergeben</h1>";
    const toList = (body?.recipients || []).filter(Boolean);

    if (!toList.length) {
      return NextResponse.json(
        { ok: false, error: "Keine Empfänger übergeben." },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: MAIL_FROM_DEFAULT,
      to: toList,
      subject,
      html,
      text: subject, // einfacher Fallback
      reply_to: MAIL_REPLY_TO_DEFAULT,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id || null });
  } catch (err: any) {
    console.error("send-offer POST failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

// === Optionaler GET-Fallback ===
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataRaw = searchParams.get("data");

  if (!dataRaw)
    return NextResponse.json(
      { ok: false, error: "QueryParam ?data fehlt." },
      { status: 400 }
    );

  try {
    const payload = JSON.parse(dataRaw);
    const to = (payload.to || "").split(",").map((s: string) => s.trim());

    if (!to.length)
      return NextResponse.json(
        { ok: false, error: "Keine Empfänger in ?data.to." },
        { status: 400 }
      );

    const { data, error } = await resend.emails.send({
      from: MAIL_FROM_DEFAULT,
      to,
      subject: payload.subject || "xVoice Angebot",
      html: payload.html || "<h1>Testmail</h1>",
      reply_to: MAIL_REPLY_TO_DEFAULT,
    });

    if (error) {
      console.error("Resend error (GET):", error);
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id || null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Ungültiges JSON im ?data Parameter." },
      { status: 400 }
    );
  }
}
