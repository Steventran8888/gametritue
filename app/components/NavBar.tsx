'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '../lib/supabase'

const supabase = createClient()

const AVATAR_BASE = 'https://dlorlkskbyyvlpcvqigl.supabase.co/storage/v1/object/public/Avatar'

function resolveAvatar(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${AVATAR_BASE}/${url}`
}

const TABS = [
  { label: '🏠 Home',   path: '/home' },
  { label: '🧩 Sudoku', path: '/game' },
  { label: '📊 Journal', path: '/trading-journal' },
]

export default function NavBar() {
  const router   = useRouter()
  const pathname = usePathname()

  const [visible, setVisible] = useState(true)
  const [player, setPlayer]   = useState<{ username: string; avatar_url: string | null; avatar_bg: string | null } | null>(null)

  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScroll = useRef(0)

  // Load player data once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('players')
        .select('username, avatar_url, avatar_bg')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setPlayer(data)
        })
    })
  }, [])

  // Auto-hide logic
  useEffect(() => {
    function scheduleHide() {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setVisible(false), 2000)
    }

    function show() {
      setVisible(true)
      scheduleHide()
    }

    function onScroll() {
      const y = window.scrollY
      if (y > lastScroll.current + 4) {
        // Scrolling down — hide immediately
        setVisible(false)
        if (hideTimer.current) clearTimeout(hideTimer.current)
      } else if (y < lastScroll.current - 4) {
        // Scrolling up — show
        show()
      }
      lastScroll.current = y
    }

    function onMouseMove(e: MouseEvent) {
      // Reveal when cursor enters top 60px
      if (e.clientY <= 60) show()
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0]
      if (t && t.clientY <= 60) show()
    }

    // Start hide timer on mount
    scheduleHide()

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchstart', onTouchStart, { passive: true })

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('touchstart', onTouchStart)
    }
  }, [])

  const avatarSrc = resolveAvatar(player?.avatar_url)

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        zIndex: 50,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid #f1f5f9',
        boxShadow: visible ? '0 1px 8px rgba(0,0,0,0.06)' : 'none',
        transform: visible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 300ms ease-in-out, box-shadow 300ms ease-in-out',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
      }}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {TABS.map(tab => {
          const isActive = pathname === tab.path || (tab.path === '/game' && pathname.startsWith('/game'))
          return (
            <button
              key={tab.path}
              onClick={() => router.push(tab.path)}
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: '4px 12px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                transition: 'background 150ms, color 150ms',
                background: isActive ? '#3b4bc8' : 'transparent',
                color: isActive ? '#ffffff' : '#475569',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f1f5f9' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* User info */}
      {player && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              overflow: 'hidden',
              background: player.avatar_bg ?? '#3b4bc8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {avatarSrc
              ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span>{player.username[0]?.toUpperCase()}</span>}
          </div>
          <span style={{ fontSize: 12, color: '#475569', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {player.username}
          </span>
        </div>
      )}
    </nav>
  )
}
