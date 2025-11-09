// app/api/place-order/route.ts
import { NextResponse } from "next/server";
import { verifyOrderToken } from "@/lib/orderToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -- Typen, die wir aus dem Token erwarten (du kannst sie bei Bedarf erweitern) --
type OrderRow = {
  sku: string;
  name: string;
  quantity: number;
  listUnit: number;
  offerUnit: number;
  listTotal: number;
  offerTotal: number;
};
type Customer = {
  company?: string;
  contact?: string;
  email?: string;
  phone?: string;
  street?: string;
  zip?: string;
  city?: string;
};
type TokenPayload = {
  offerId: string;
  vatRate: number;
  customer: Customer;
  monthlyRows: OrderRow[];
  oneTimeRows: OrderRow[];
};

// Utility: kleine Validierung
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const { token } = body || {};

    if (!isNonEmptyString(token)) {
      return NextResponse.json(
        { ok: false, error: "token fehlt oder ist ungültig." },
        { status: 400 }
      );
    }

    // 1) Token verifizieren
    const verified = verifyOrderToken(token);

    if (!verified.ok) {
      return NextResponse.json(
        { ok: false, error: `Token ungültig: ${verified.error}` },
        { status: 400 }
      );
    }

    // 2) Payload TYP-SICHER herausziehen (Type Guard erledigt das Narrowing)
    const payload = verified.payload as TokenPayload;

    // Minimal-Validierung wichtiger Felder
    if (!isNonEmptyString(payload.offerId)) {
      return NextResponse.json(
        { ok: false, error: "offerId fehlt im Payload." },
        { status: 400 }
      );
    }
    if (typeof payload.vatRate !== "number") {
      return NextResponse.json(
        { ok: false, error: "vatRate fehlt/ungültig im Payload." },
        { status: 400 }
      );
    }

    // 3) Optional: an Make/Pipedrive/Webhook weiterreichen
    //    (nur wenn MAKE_WEBHOOK_URL gesetzt ist)
    const makeUrl = process.env.MAKE_WEBHOOK_URL;
    if (isNonEmptyString(makeUrl)) {
      await fetch(makeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Hier schicken wir alles Relevante hin
        body: JSON.stringify({
          source: "xvoice-offer-order",
          offerId: payload.offerId,
          vatRate: payload.vatRate,
          customer: payload.customer,
          monthlyRows: payload.monthlyRows,
          oneTimeRows: payload.oneTimeRows,
          receivedAt: new Date().toISOString(),
        }),
      }).catch((err) => {
        // Nicht hart failen – wir antworten trotzdem 200, damit der Kunde nicht hängt
        console.error("MAKE webhook error:", err);
      });
    }

    // 4) Response an die App
    return NextResponse.json({
      ok: true,
      offerId: payload.offerId,
      info: "Order empfangen und verarbeitet.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}

// GET als Healthcheck
export async function GET() {
  return NextResponse.json({ ok: true, info: "place-order endpoint ready" });
}
