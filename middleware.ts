import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname

  const isTradingLog = hostname.includes('tradinglog.cc')

  if (isTradingLog) {
    // Cho phép: /trading-journal/*, /auth/*, /login, /api/*
    if (
      pathname.startsWith('/trading-journal') ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/api')
    ) {
      return NextResponse.next()
    }
    // Tất cả còn lại → redirect về /trading-journal
    return NextResponse.redirect(new URL('/trading-journal', request.url))
  }

  // gametritue.vercel.app
  if (!isTradingLog) {
    // Cho phép: /game/*, /auth/*, /login, /api/*
    if (
      pathname.startsWith('/game') ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/api')
    ) {
      return NextResponse.next()
    }
    // Tất cả còn lại → redirect về /game
    return NextResponse.redirect(new URL('/game', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
