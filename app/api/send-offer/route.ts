import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json()
  // TODO: integrate with your email provider here (SendGrid/Resend)
  return NextResponse.json({ ok: true, received: { to: body?.recipients ?? [], subject: body?.meta?.subject ?? '' } })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return NextResponse.json({ ok: true, query: Object.fromEntries(searchParams.entries()) })
}
