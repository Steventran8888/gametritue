import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const xForwardedHost = request.headers.get('x-forwarded-host') || ''
  const pathname = request.nextUrl.pathname

  // Cloudflare forwards the real hostname via x-forwarded-host
  const effectiveHostname = xForwardedHost || hostname
  const isTradingLog = effectiveHostname.includes('tradinglog.cc')

  // tradinglog.cc → chỉ vào /trading-journal
  if (isTradingLog) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/trading-journal', request.url))
    }
    if (pathname.startsWith('/home') || pathname.startsWith('/game')) {
      return NextResponse.redirect(new URL('/trading-journal', request.url))
    }
  }

  // gametritue.vercel.app → chỉ vào /game
  if (!isTradingLog) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/game', request.url))
    }
    if (pathname.startsWith('/home') || pathname.startsWith('/trading-journal')) {
      return NextResponse.redirect(new URL('/game', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)']
}
