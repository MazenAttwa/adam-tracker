'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { OrderCard } from '@/components/orders/OrderCard'
import { Badge } from '@/components/ui/Badge'
import { STAGE_COLORS, STAGES } from '@/lib/stageConfig'
import type { Order, Stage } from '@/lib/types'

export default function DashboardPage() {
  const { profile, loading } = useAuth()
  const { tr } = useLang()
  const router = useRouter()
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    fetchOrders()
    const channel = supabase
      .channel('dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOrders() {
    let query = supabase
      .from('orders')
      .select('*')
      .order('updated_at', { ascending: false })

    if (profile?.role === 'worker' && profile.assigned_stage) {
      query = query.eq('current_stage', profile.assigned_stage)
    }

    const { data } = await query.limit(50)
    setOrders(data ?? [])
    setFetching(false)
  }

  const stageLabels: Record<Stage, string> = {
    draft: tr.draft,
    preparation: tr.preparation,
    cutting_printing: tr.cutting_printing,
    finishing: tr.finishing,
    submitted: tr.submitted,
  }

  const stats = {
    total: orders.length,
    active: orders.filter(o => o.status === 'active').length,
    completed: orders.filter(o => o.status === 'completed').length,
  }

  const stageCounts = STAGES.reduce((acc, s) => {
    acc[s] = orders.filter(o => o.current_stage === s && o.status === 'active').length
    return acc
  }, {} as Record<Stage, number>)

  if (loading || fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">{tr.loading}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.dashboard}</h1>
            <p className="text-gray-500 text-sm mt-1">{tr.appName} · {tr.appTagline}</p>
          </div>
          {profile?.role === 'manager' && (
            <Link href="/orders/new"
              className="inline-flex items-center gap-2 bg-[#0f1b35] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2d55] transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {tr.newOrder}
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[
            { label: tr.totalOrders, value: stats.total, color: 'text-[#0f1b35]', bg: 'bg-white' },
            { label: tr.activeOrders, value: stats.active, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: tr.completedOrders, value: stats.completed, color: 'text-green-600', bg: 'bg-green-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-6 border border-gray-100 shadow-sm`}>
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Pipeline overview (manager only) */}
        {profile?.role === 'manager' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-8">
            <h2 className="font-semibold text-[#0f1b35] mb-4">{tr.pipeline}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {STAGES.map(stage => (
                <Link key={stage} href={`/orders?stage=${stage}`}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100 hover:border-[#c9a84c]/40 hover:bg-[#c9a84c]/5 transition-all cursor-pointer">
                  <span className="text-2xl font-bold text-[#0f1b35]">{stageCounts[stage]}</span>
                  <Badge className={STAGE_COLORS[stage]}>{stageLabels[stage]}</Badge>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent orders */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#0f1b35]">{tr.recentOrders}</h2>
            <Link href="/orders" className="text-sm text-[#c9a84c] hover:underline">{tr.orders} →</Link>
          </div>

          {orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">{tr.noOrders}</p>
              {profile?.role === 'manager' && (
                <Link href="/orders/new" className="inline-flex items-center gap-1 text-[#c9a84c] text-sm mt-2 hover:underline">
                  {tr.newOrder} →
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.slice(0, 6).map(order => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
