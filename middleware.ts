import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''
  const pathname = request.nextUrl.pathname

  // tradinglog.cc → chỉ cho phép vào /trading-journal, /auth, /login, /api
  if (hostname.includes('tradinglog.cc')) {
    // Nếu vào root → redirect về /trading-journal
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/trading-journal', request.url))
    }
    // Nếu vào /home hoặc /game → redirect về /trading-journal
    if (pathname.startsWith('/home') || pathname.startsWith('/game')) {
      return NextResponse.redirect(new URL('/trading-journal', request.url))
    }
  }

  // gametritue.vercel.app → chỉ cho phép vào /game, /auth, /login, /api
  // Nếu vào root → redirect về /game (bỏ qua trang home)
  if (!hostname.includes('tradinglog.cc')) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/game', request.url))
    }
    // Nếu vào /home hoặc /trading-journal → redirect về /game
    if (pathname.startsWith('/home') || pathname.startsWith('/trading-journal')) {
      return NextResponse.redirect(new URL('/game', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)']
}
