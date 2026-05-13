import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (password === process.env.JOURNAL_PASSWORD) {
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ success: false }, { status: 401 })
}
