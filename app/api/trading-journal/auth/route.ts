import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const envPassword = (process.env.JOURNAL_PASSWORD || '').trim()
  const inputPassword = (body.password || '').trim()

  if (inputPassword === envPassword) {
    return NextResponse.json({ success: true })
  }

  // Temporary debug — remove after fix confirmed
  console.log('ENV password bytes:', [...envPassword].map(c => c.charCodeAt(0)))
  console.log('Input password bytes:', [...inputPassword].map(c => c.charCodeAt(0)))
  return NextResponse.json({ success: false }, { status: 401 })
}
