// app/api/sign-order/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

// b64url helpers
const toB64Url = (buf: Buffer) =>
  buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");

export async function POST(req: Request) {
  try {
    const ORDER_SECRET = process.env.ORDER_SECRET;
    if (!ORDER_SECRET) {
      return NextResponse.json({ error: "ORDER_SECRET ist nicht gesetzt" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const payload = body?.payload;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "payload fehlt oder ist ungültig" }, { status: 400 });
    }

    // Token bauen: header = 'plain'
    const header = "plain";
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = toB64Url(Buffer.from(payloadStr, "utf8"));
    const unsigned = `${header}.${payloadB64}`;

    const mac = crypto.createHmac("sha256", Buffer.from(ORDER_SECRET, "utf8"))
      .update(unsigned)
      .digest();

    const sig = toB64Url(mac);
    const token = `${unsigned}.${sig}`;

    return NextResponse.json({ token });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
