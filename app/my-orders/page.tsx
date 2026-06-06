'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { Badge } from '@/components/ui/Badge'
import { StageProgress } from '@/components/orders/StageProgress'
import { STAGE_COLORS, STATUS_COLORS } from '@/lib/stageConfig'
import { formatDate } from '@/lib/utils'
import type { Order, Stage } from '@/lib/types'

export default function MyOrdersPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    fetchOrders()
    const channel = supabase
      .channel('my-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOrders() {
    if (!profile) return
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
    setFetching(false)
  }

  const stageLabels: Record<Stage, string> = {
    draft: tr.draft, preparation: tr.preparation,
    cutting_printing: tr.cutting_printing, finishing: tr.finishing, submitted: tr.submitted,
  }

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-[#f5f5f0]">
        <Navbar />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-10 h-10 border-3 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.myOrders}</h1>
          <p className="text-gray-500 text-sm mt-1">{tr.appName}</p>
        </div>

        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">{tr.noOrders}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <Link key={order.id} href={`/orders/${order.id}`}
                className="block bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-[#c9a84c]/40 transition-all p-6 group">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="font-semibold text-[#0f1b35] group-hover:text-[#c9a84c] transition-colors text-lg">
                      {order.order_number}
                    </p>
                    <p className="text-sm text-gray-400 mt-0.5">{formatDate(order.created_at, lang)}</p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Badge className={STATUS_COLORS[order.status]}>{tr[order.status]}</Badge>
                    <Badge className={STAGE_COLORS[order.current_stage]}>{stageLabels[order.current_stage]}</Badge>
                  </div>
                </div>
                <StageProgress currentStage={order.current_stage} />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
