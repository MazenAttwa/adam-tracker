'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useLang } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const { tr, lang, setLang } = useLang()
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(tr.loginError)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#0f1b35] flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, #c9a84c 0, #c9a84c 1px, transparent 0, transparent 50%)',
        backgroundSize: '20px 20px'
      }} />

      <div className="relative w-full max-w-md">
        {/* Logo card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-[#0f1b35] px-8 py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#c9a84c] flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-[#0f1b35] font-bold text-3xl">A</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{tr.appName}</h1>
            <p className="text-[#c9a84c] text-sm mt-1">{tr.appTagline}</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-[#0f1b35]">{tr.loginTitle}</h2>
              <p className="text-sm text-gray-500 mt-1">{tr.loginSubtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={tr.email}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
              <Input
                label={tr.password}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full" size="lg">
                {loading ? tr.loggingIn : tr.login}
              </Button>
            </form>
          </div>

          {/* Language toggle footer */}
          <div className="px-8 pb-6 flex justify-center">
            <button
              onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
              className="text-sm text-gray-400 hover:text-[#c9a84c] transition-colors"
            >
              {lang === 'en' ? 'العربية' : 'English'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
