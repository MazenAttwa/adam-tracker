'use client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

export function Navbar() {
  const { profile, signOut } = useAuth()
  const { lang, setLang, tr } = useLang()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const navLinks = profile?.role === 'customer'
    ? [{ href: '/my-orders', label: tr.myOrders }]
    : profile?.role === 'manager'
    ? [
        { href: '/dashboard', label: tr.dashboard },
        { href: '/orders', label: tr.orders },
        { href: '/orders/new', label: tr.newOrder },
        { href: '/materials', label: tr.materials },
        { href: '/stock', label: tr.stock },
        { href: '/vendors', label: tr.vendors },
        { href: '/finance', label: tr.finance },
        { href: '/retailers', label: tr.retailers },
        { href: '/sales', label: tr.sales },
        { href: '/reports', label: tr.reports },
      ]
    : [
        { href: '/dashboard', label: tr.dashboard },
        { href: '/orders', label: tr.orders },
      ]

  return (
    <nav className="bg-[#0f1b35] text-white sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#c9a84c] flex items-center justify-center font-bold text-[#0f1b35] text-sm">A</div>
            <div className="hidden sm:block">
              <div className="font-bold text-sm leading-tight">{tr.appName}</div>
              <div className="text-xs text-gray-400 leading-tight">{tr.appTagline}</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(l => (
              <Link key={l.href} href={l.href}
                className="px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/20 text-gray-300 hover:text-white hover:border-white/40 transition-colors"
            >
              {lang === 'en' ? 'العربية' : 'English'}
            </button>

            {/* User menu */}
            {profile && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-[#c9a84c] flex items-center justify-center text-[#0f1b35] font-bold text-xs">
                    {profile.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-medium leading-tight">{profile.name}</div>
                    <div className="text-xs text-gray-400 leading-tight capitalize">{tr[profile.role]}</div>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50">
                    <button
                      onClick={() => { setMenuOpen(false); handleSignOut() }}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      {tr.logout}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <div className="md:hidden pb-3 border-t border-white/10 mt-1 pt-2 flex flex-col gap-1">
            {navLinks.map(l => (
              <Link key={l.href} href={l.href}
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}
