import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const body = await req.json()
  // TODO: persist order to CRM/ERP
  return NextResponse.json({ ok: true, order: { company: body?.customer?.company ?? '' } })
}
