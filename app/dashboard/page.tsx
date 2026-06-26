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
import type { Order, Stage, Material, Retailer } from '@/lib/types'

export default function DashboardPage() {
  const { profile, loading } = useAuth()
  const { tr } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [orders, setOrders] = useState<Order[]>([])
  const [fetching, setFetching] = useState(true)

  // Manager-only extras
  const [monthRev, setMonthRev] = useState(0)
  const [monthExp, setMonthExp] = useState(0)
  const [lowStock, setLowStock] = useState<Material[]>([])
  const [topRetailers, setTopRetailers] = useState<Retailer[]>([])
  const [orderLogistics, setOrderLogistics] = useState(0)
  const [materialLogistics, setMaterialLogistics] = useState(0)

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    fetchOrders()
    if (profile.role === 'manager') fetchManagerExtras()
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

  async function fetchManagerExtras() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const start = `${y}-${m}-01`
    const nextM = now.getMonth() === 11
      ? `${y + 1}-01-01`
      : `${y}-${String(now.getMonth() + 2).padStart(2, '0')}-01`

    const [{ data: revD }, { data: expD }, { data: matD }, { data: retD }, { data: sdD }, { data: smD }] = await Promise.all([
      supabase.from('revenue').select('amount').gte('date', start).lt('date', nextM),
      supabase.from('expenses').select('amount').gte('date', start).lt('date', nextM),
      supabase.from('materials').select('*'),
      supabase.from('retailers').select('*').gt('balance', 0).order('balance', { ascending: false }).limit(5),
      supabase.from('stage_data').select('data'),
      supabase.from('stock_movements').select('logistic_cost'),
    ])

    setMonthRev(((revD ?? []) as { amount: number }[]).reduce((s, r) => s + (r.amount || 0), 0))
    setMonthExp(((expD ?? []) as { amount: number }[]).reduce((s, e) => s + (e.amount || 0), 0))
    const allMats = (matD ?? []) as Material[]
    setLowStock(allMats.filter(mat => mat.current_quantity <= mat.minimum_quantity).slice(0, 5))
    setTopRetailers((retD ?? []) as Retailer[])

    const ordLog = ((sdD ?? []) as { data: Record<string, unknown> | null }[]).reduce((s, row) => {
      const v = row.data?.logistic_cost
      return s + (typeof v === 'number' ? v : 0)
    }, 0)
    setOrderLogistics(ordLog)
    const matLog = ((smD ?? []) as { logistic_cost: number | null }[]).reduce((s, r) => s + (r.logistic_cost || 0), 0)
    setMaterialLogistics(matLog)
  }

  const stageLabels: Record<Stage, string> = {
    draft: tr.draft,
    preparation: tr.preparation,
    cutting: tr.cutting,
    printing: tr.printing,
    finishing: tr.finishing,
    submitted: tr.submitted, received: tr.received,
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

  const netProfit = monthRev - monthExp

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

        {/* Quick Actions (manager only) */}
        {profile?.role === 'manager' && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{tr.quickActions}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Link href="/orders/new"
                className="flex items-center gap-2 bg-[#0f1b35] text-white px-4 py-3 rounded-xl text-sm font-medium hover:bg-[#1a2d55] transition-colors shadow-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {tr.newOrder}
              </Link>
              <Link href="/materials"
                className="flex items-center gap-2 bg-white text-[#0f1b35] border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium hover:border-[#c9a84c] transition-colors shadow-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                {tr.addMaterial}
              </Link>
              <Link href="/finance"
                className="flex items-center gap-2 bg-white text-[#0f1b35] border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium hover:border-[#c9a84c] transition-colors shadow-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {tr.addExpense}
              </Link>
              <Link href="/sales"
                className="flex items-center gap-2 bg-white text-[#0f1b35] border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium hover:border-[#c9a84c] transition-colors shadow-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                {tr.addSale}
              </Link>
            </div>
          </div>
        )}

        {/* Orders stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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

        {/* Monthly P&L (manager only) */}
        {profile?.role === 'manager' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 rounded-xl p-6 border border-green-100 shadow-sm">
              <p className="text-sm text-gray-500">{tr.revenue} · {tr.financialSummary}</p>
              <p className="text-3xl font-bold mt-1 text-green-700 tabular-nums">
                {monthRev.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-red-50 rounded-xl p-6 border border-red-100 shadow-sm">
              <p className="text-sm text-gray-500">{tr.expenses} · {tr.financialSummary}</p>
              <p className="text-3xl font-bold mt-1 text-red-700 tabular-nums">
                {monthExp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`${netProfit >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'} rounded-xl p-6 border shadow-sm`}>
              <p className="text-sm text-gray-500">{tr.netProfit} · {tr.financialSummary}</p>
              <p className={`text-3xl font-bold mt-1 tabular-nums ${netProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {netProfit >= 0 ? '+' : ''}{netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* Logistics costs (manager only) */}
        {profile?.role === 'manager' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-[#0f1b35] mb-4">{tr.logisticsReport}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                <p className="text-sm text-gray-500">{tr.orderLogistics}</p>
                <p className="text-2xl font-bold mt-1 text-amber-700 tabular-nums">
                  {orderLogistics.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                <p className="text-sm text-gray-500">{tr.materialLogistics}</p>
                <p className="text-2xl font-bold mt-1 text-amber-700 tabular-nums">
                  {materialLogistics.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-[#0f1b35] rounded-xl p-5">
                <p className="text-sm text-gray-300">{tr.totalLogistics}</p>
                <p className="text-2xl font-bold mt-1 text-white tabular-nums">
                  {(orderLogistics + materialLogistics).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pipeline overview (manager only) */}
        {profile?.role === 'manager' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-[#0f1b35] mb-4">{tr.pipeline}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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

        {/* Low stock + top retailers (manager only) */}
        {profile?.role === 'manager' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#0f1b35]">{tr.lowStockAlert}</h2>
                <Link href="/materials" className="text-xs text-[#c9a84c] hover:underline">{tr.viewAll}</Link>
              </div>
              {lowStock.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">{tr.noLowStock}</p>
              ) : (
                <div className="space-y-2">
                  {lowStock.map(mat => (
                    <div key={mat.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[#0f1b35]">{mat.name}</p>
                        <p className="text-xs font-mono text-gray-400">{mat.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-red-600">
                          {mat.current_quantity.toLocaleString()} / {mat.minimum_quantity.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">{mat.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#0f1b35]">{tr.topRetailers}</h2>
                <Link href="/retailers" className="text-xs text-[#c9a84c] hover:underline">{tr.viewAll}</Link>
              </div>
              {topRetailers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">{tr.noOutstanding}</p>
              ) : (
                <div className="space-y-2">
                  {topRetailers.map(r => (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-[#0f1b35]">{r.name}</p>
                        <p className="text-xs text-gray-400 capitalize">
                          {r.type === 'wholesale' ? tr.wholesale : tr.retail}
                        </p>
                      </div>
                      <p className="text-sm font-bold tabular-nums text-blue-700">
                        {r.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
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
