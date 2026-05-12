'use client'

import { createClient } from '../lib/supabase'

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

function LogoMark({ size, dark = false }: { size: number; dark?: boolean }) {
  return (
    <div
      className="relative rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, background: dark ? 'rgba(59,75,200,0.1)' : 'rgba(255,255,255,0.2)' }}
    >
      <span
        className="absolute font-bold select-none"
        style={{ fontSize: size * 0.4, color: dark ? '#3b4bc8' : '#ffffff' }}
      >
        G
      </span>
      <img
        src={LOGO_URL}
        alt=""
        className="absolute inset-0 w-full h-full object-contain"
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
    </div>
  )
}

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
  }

  async function signInWithApple() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="flex min-h-screen min-h-dvh">

      {/* ── LEFT PANEL (desktop only) ── */}
      <div
        className="hidden md:flex md:w-1/2 flex-col items-center justify-between py-16 px-14 relative overflow-hidden"
        style={{ background: 'linear-gradient(155deg, #3b4bc8 0%, #5c35d4 100%)' }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/5 pointer-events-none" />

        {/* Center branding */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center z-10">
          <LogoMark size={120} />
          <h1 className="font-bold text-white mt-1" style={{ fontSize: 32 }}>Gametritue</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Rèn trí tuệ · Leo bảng xếp hạng
          </p>
        </div>

        {/* Bullet points */}
        <div className="flex flex-col gap-3 z-10 w-full">
          {[
            '100 puzzle · 10 level độ khó',
            'Bảng xếp hạng toàn cầu',
            'Coin & phần thưởng hàng ngày',
          ].map(text => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.2)' }}>
                <span className="text-white text-xs">✓</span>
              </div>
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-white"
        style={{ padding: '48px 24px' }}>

        {/* Mobile: override padding to 24px */}
        <style>{`@media(min-width:768px){.right-inner{padding:48px}}`}</style>

        {/* Mobile logo */}
        <div className="flex md:hidden flex-col items-center gap-3 mb-8">
          <LogoMark size={56} dark />
          <span className="font-bold text-2xl" style={{ color: '#131a52' }}>Gametritue</span>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm z-10">
          <h2 className="font-bold mb-1" style={{ fontSize: 28, color: '#131a52' }}>
            Chào mừng trở lại
          </h2>
          <p className="text-sm mb-8" style={{ color: '#94a3b8' }}>
            Đăng nhập để tiếp tục hành trình
          </p>

          {/* Google button */}
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 rounded-full transition-all hover:bg-slate-50 active:scale-95"
            style={{ height: 52, border: '1.5px solid #e2e8f0', background: '#ffffff' }}
          >
            {GOOGLE_SVG}
            <span style={{ fontSize: 15, fontWeight: 500, color: '#1e293b' }}>Tiếp tục với Google</span>
          </button>

          <div style={{ height: 12 }} />

          {/* Apple button */}
          <button
            onClick={signInWithApple}
            className="w-full flex items-center justify-center gap-3 rounded-full transition-all hover:opacity-90 active:scale-95"
            style={{ height: 52, background: '#000000' }}
          >
            {APPLE_SVG}
            <span style={{ fontSize: 15, fontWeight: 600, color: '#ffffff' }}>Tiếp tục với Apple</span>
          </button>

          <div style={{ height: 32 }} />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
            <span className="text-sm" style={{ color: '#94a3b8' }}>hoặc</span>
            <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
          </div>

          <div style={{ height: 32 }} />

          {/* Terms */}
          <p className="text-center" style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
            Bằng cách đăng nhập, bạn đồng ý với{' '}
            <span className="underline cursor-pointer hover:text-slate-600 transition-colors">Điều khoản sử dụng</span>
            {' '}và{' '}
            <span className="underline cursor-pointer hover:text-slate-600 transition-colors">Chính sách bảo mật</span>
          </p>
        </div>

        {/* Wave decoration — mobile only */}
        <div className="md:hidden absolute bottom-0 left-0 right-0 pointer-events-none select-none">
          <svg viewBox="0 0 390 150" xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none" className="w-full" style={{ display: 'block' }}>
            <path fill="#f7941d" fillOpacity="0.15"
              d="M0,90 C70,140 180,30 390,100 L390,150 L0,150 Z" />
            <path fill="#3aaa35" fillOpacity="0.18"
              d="M0,110 C110,55 260,145 390,75 L390,150 L0,150 Z" />
            <path fill="#3b4bc8" fillOpacity="0.25"
              d="M0,125 C130,90 280,150 390,108 L390,150 L0,150 Z" />
          </svg>
        </div>
      </div>

    </div>
  )
}
