'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function NewOrderPage() {
  const { profile, loading } = useAuth()
  const { tr } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!loading && profile?.role !== 'manager') {
    router.push('/dashboard')
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerName.trim()) return
    setSaving(true)
    setError('')

    const { data, error: err } = await supabase
      .from('orders')
      .insert({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        current_stage: 'draft',
        status: 'active',
        created_by: profile?.id,
        order_number: '',
      })
      .select()
      .single()

    setSaving(false)

    if (err) {
      setError(tr.error)
      return
    }

    router.push(`/orders/${data.id}`)
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <Navbar />
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#0f1b35] mb-6 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {tr.back}
        </button>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-xl font-bold text-[#0f1b35] mb-6">{tr.createOrder}</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={tr.customerName}
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              required
              placeholder="John Doe"
            />
            <Input
              label={tr.customerPhone}
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="+20 10 0000 0000"
              type="tel"
            />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" type="button" onClick={() => router.back()}>
                {tr.cancel}
              </Button>
              <Button type="submit" loading={saving}>
                {tr.createOrder}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
