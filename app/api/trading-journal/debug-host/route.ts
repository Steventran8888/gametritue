import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const headersList = await headers()
  const host = headersList.get('host')
  const xForwardedHost = headersList.get('x-forwarded-host')
  
  return NextResponse.json({
    host,
    xForwardedHost,
  })
}