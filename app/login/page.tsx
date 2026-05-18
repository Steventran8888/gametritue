'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase'

// ── DESIGN.md tokens (login context) ──────────────────────────────
// colors.login-surface           #f8fafc
// colors.login-surface-container #ffffff
// colors.login-on-surface        #0f172a
// colors.login-on-surface-variant #475569
// colors.login-outline           #cbd5e1
// colors.primary                 #3b4bc8
// colors.on-primary              #ffffff
// typography.brand-logo          Playfair Display 28px/600/-0.01em
// typography.headline-md         Inter 24px/600/-0.01em
// typography.body-md             Inter 14px/400
// typography.label-lg            Inter 14px/600/0.01em
// typography.label-md            Inter 12px/600/0.02em
// rounded.full                   9999px
// rounded.2xl                    2rem
// spacing.xl                     40px
// spacing.lg                     24px
// components.login-card          bg #ffffff, radius 2rem, padding 40px
// ──────────────────────────────────────────────────────────────────

const LOGO_URL = 'https://dlorlkskbyyvlpcvqigl.supabase.co/storage/v1/object/public/assets/logo/gametritue-stacked-fullcolor.svg'

const GOOGLE_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className="flex-shrink-0">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
)

const APPLE_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true" className="flex-shrink-0">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
  </svg>
)

export default function LoginPage() {
  const [isTradingLog, setIsTradingLog] = useState(false)

  useEffect(() => {
    setIsTradingLog(window.location.hostname.includes('tradinglog'))
  }, [])

  async function signInWithGoogle() {
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback`
    console.log('redirectTo:', redirectTo)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  async function signInWithApple() {
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback`
    console.log('redirectTo:', redirectTo)
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo },
    })
  }

  return (
    <div className="flex min-h-screen">

      {/* ── LEFT PANEL — login-surface-container #ffffff, desktop only ── */}
      <div
        className="hidden md:flex md:w-1/2 flex-col items-center justify-between py-16 px-14 relative overflow-hidden"
        style={{ backgroundColor: '#ffffff' /* login-surface-container */ }}
      >
        {/* Center: logo + tagline */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center z-10">
          <div style={{ width: 220, height: 220 }}>
            <img
              src={LOGO_URL}
              alt="Gametritue"
              className="w-full h-full object-contain"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          </div>
          {!isTradingLog && (
            <p style={{
              color: '#475569',       /* login-on-surface-variant */
              fontSize: 14,           /* typography.body-md */
              fontWeight: 400,
              lineHeight: '20px',
            }}>
              Rèn trí tuệ · Leo bảng xếp hạng
            </p>
          )}
        </div>

        {/* Wave image at bottom */}
        <img
          src="https://dlorlkskbyyvlpcvqigl.supabase.co/storage/v1/object/public/assets/login/wave-left-panel.svg"
          alt=""
          className="pointer-events-none select-none"
          style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 'auto' }}
        />
      </div>

      {/* ── RIGHT PANEL — login-surface #f8fafc ── */}
      <div
        className="flex-1 flex flex-col items-center justify-center relative overflow-hidden px-6 py-12 md:px-12"
        style={{ backgroundColor: '#f8fafc' /* login-surface */ }}
      >
        {/* Mobile brand mark (hidden on desktop) */}
        <div className="flex md:hidden flex-col items-center gap-3 mb-8">
          <div style={{ width: 56, height: 56 }}>
            <img
              src={LOGO_URL}
              alt=""
              className="w-full h-full object-contain"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          </div>
          <span style={{
            fontFamily: 'var(--font-playfair), "Playfair Display", Georgia, serif', /* brand-logo */
            fontSize: 28,
            fontWeight: 600,
            lineHeight: '36px',
            letterSpacing: '-0.01em',
            color: '#0f172a', /* login-on-surface */
          }}>
            {isTradingLog ? 'Trading Log' : 'Gametritue'}
          </span>
        </div>

        {/* Login card — login-surface-container, rounded-2xl, padding xl */}
        <div
          className="w-full z-10"
          style={{
            maxWidth: 400,
            backgroundColor: '#ffffff',                  /* login-surface-container */
            borderRadius: '2rem',                         /* rounded.2xl */
            padding: 40,                                  /* spacing.xl */
            boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 8px 32px rgba(15,23,42,0.08)',
          }}
        >
          {/* Heading — headline-md */}
          <h2 style={{
            fontFamily: 'var(--font-inter), Inter, sans-serif',
            fontSize: 24,             /* typography.headline-md */
            fontWeight: 600,
            lineHeight: '32px',
            letterSpacing: '-0.01em',
            color: '#0f172a',         /* login-on-surface */
            marginBottom: 8,          /* spacing.sm */
          }}>
            Chào mừng trở lại
          </h2>

          {/* Subtitle — body-md */}
          <p style={{
            fontSize: 14,             /* typography.body-md */
            fontWeight: 400,
            lineHeight: '20px',
            color: '#475569',         /* login-on-surface-variant */
            marginBottom: 24,         /* spacing.lg */
          }}>
            Đăng nhập để tiếp tục hành trình
          </p>

          {/* Google — social button, white bg + login-outline border, rounded-full */}
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 active:scale-95"
            style={{
              height: 48,
              backgroundColor: '#ffffff',     /* login-surface-container */
              border: '1.5px solid #cbd5e1',  /* login-outline */
              borderRadius: 9999,             /* rounded.full */
              cursor: 'pointer',
              transition: 'background-color 150ms ease-out',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff' }}
          >
            {GOOGLE_SVG}
            <span style={{
              fontSize: 14,           /* typography.label-lg */
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: '#0f172a',       /* login-on-surface */
            }}>
              Tiếp tục với Google
            </span>
          </button>

          <div style={{ height: 12 }} />

          {/* Apple — social button, black bg, rounded-full */}
          <button
            onClick={signInWithApple}
            className="w-full flex items-center justify-center gap-3 active:scale-95"
            style={{
              height: 48,
              backgroundColor: '#000000',
              border: 'none',
              borderRadius: 9999,   /* rounded.full */
              cursor: 'pointer',
              transition: 'opacity 150ms ease-out',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {APPLE_SVG}
            <span style={{
              fontSize: 14,         /* typography.label-lg */
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: '#ffffff',
            }}>
              Tiếp tục với Apple
            </span>
          </button>

          <div style={{ height: 32 }} />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div style={{ flex: 1, height: 1, backgroundColor: '#cbd5e1' }} /* login-outline */ />
            <span style={{
              fontSize: 14,         /* typography.body-md */
              fontWeight: 400,
              color: '#475569',     /* login-on-surface-variant */
            }}>
              hoặc
            </span>
            <div style={{ flex: 1, height: 1, backgroundColor: '#cbd5e1' }} /* login-outline */ />
          </div>

          <div style={{ height: 32 }} />

          {/* Terms — label-md */}
          <p style={{
            textAlign: 'center',
            fontSize: 12,           /* typography.label-md */
            fontWeight: 600,
            letterSpacing: '0.02em',
            lineHeight: 1.7,
            color: '#475569',       /* login-on-surface-variant */
          }}>
            Bằng cách đăng nhập, bạn đồng ý với{' '}
            <span className="underline cursor-pointer hover:opacity-80 transition-opacity">Điều khoản sử dụng</span>
            {' '}và{' '}
            <span className="underline cursor-pointer hover:opacity-80 transition-opacity">Chính sách bảo mật</span>
          </p>
        </div>
      </div>

    </div>
  )
}
