'use client'
import { useAuth } from '@/contexts/AuthContext'
import { BrandSwitcher } from '@/components/layout/BrandSwitcher'
import { useLang } from '@/contexts/LanguageContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'

export function Navbar() {
  const { profile, signOut } = useAuth()
  const { lang, setLang, tr } = useLang()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const linkGroups = profile?.role === 'customer'
    ? { primary: [{ href: '/my-orders', label: tr.myOrders }], more: [] as { href: string; label: string }[] }
    : profile?.role === 'manager'
    ? {
        primary: [
          { href: '/dashboard', label: tr.dashboard },
          { href: '/orders', label: tr.orders },
          { href: '/orders/new', label: tr.newOrder },
          { href: '/materials', label: tr.materials },
          { href: '/stock', label: tr.stock },
          { href: '/finance', label: tr.finance },
          { href: '/reports', label: tr.reports },
        ],
        more: [
          { href: '/sales', label: tr.sales },
          { href: '/statements', label: tr.statements },
          { href: '/vendors', label: tr.vendors },
          { href: '/manufacturers', label: tr.manufacturers },
          { href: '/retailers', label: tr.retailers },
          { href: '/logistics', label: tr.logistics },
          { href: '/backup', label: tr.backup },
          { href: '/audit', label: tr.auditLog },
        ],
      }
    : { primary: [{ href: '/dashboard', label: tr.dashboard }, { href: '/orders', label: tr.orders }], more: [] as { href: string; label: string }[] }
  const navLinks = [...linkGroups.primary, ...linkGroups.more]

  function navIcon(href: string): ReactNode {
    const wrap = (c: ReactNode) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">{c}</svg>
    )
    switch (href) {
      case '/dashboard': return wrap(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></>)
      case '/orders': case '/my-orders': return wrap(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>)
      case '/orders/new': return wrap(<><path d="M12 5v14" /><path d="M5 12h14" /></>)
      case '/materials': return wrap(<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />)
      case '/stock': return wrap(<><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>)
      case '/finance': return wrap(<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>)
      case '/reports': return wrap(<><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" /></>)
      case '/sales': return wrap(<><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>)
      case '/vendors': case '/logistics': return wrap(<><rect x="1" y="3" width="15" height="13" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>)
      case '/manufacturers': return wrap(<><path d="M2 20h20" /><path d="M4 20V8l6 4V8l6 4V6l4 2v12" /></>)
      case '/retailers': return wrap(<><path d="M3 9l1-5h16l1 5" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></>)
      case '/statements': return wrap(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></>)
      case '/backup': return wrap(<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>)
      case '/audit': return wrap(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>)
      default: return wrap(<circle cx="12" cy="12" r="9" />)
    }
  }

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

          <div className="ml-1 mr-2"><BrandSwitcher /></div>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5">
            {linkGroups.primary.map(l => (
              <Link key={l.href} href={l.href}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
                {navIcon(l.href)}{l.label}
              </Link>
            ))}
            {linkGroups.more.length > 0 && (
              <div className="relative">
                <button onClick={() => setMoreOpen(o => !o)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
                  {tr.more}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                      {linkGroups.more.map(l => (
                        <Link key={l.href} href={l.href} onClick={() => setMoreOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#0f1b35] hover:bg-gray-50 transition-colors">
                          {navIcon(l.href)}{l.label}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
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
              className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors"
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
          <div className="lg:hidden pb-3 border-t border-white/10 mt-1 pt-2 flex flex-col gap-1">
            {navLinks.map(l => (
              <Link key={l.href} href={l.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
                {navIcon(l.href)}{l.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}
