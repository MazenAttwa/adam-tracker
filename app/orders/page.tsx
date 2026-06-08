'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { OrderCard } from '@/components/orders/OrderCard'
import { ProductionGantt, type DragOrder } from '@/components/orders/ProductionGantt'
import { STAGES, STAGE_COLORS } from '@/lib/stageConfig'
import { cn } from '@/lib/utils'
import type { Order, Stage, OrderStatus } from '@/lib/types'

export default function OrdersPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [orders, setOrders] = useState<Order[]>([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')

  // ── Drag state ────────────────────────────────────────────
  const [draggingOrder, setDraggingOrder] = useState<DragOrder | null>(null)
  const [ghostPos,      setGhostPos]      = useState({ x: 0, y: 0 })
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null)
  const [pendingDrop, setPendingDrop] = useState<{ lineId: string; order: DragOrder } | null>(null)

  // Global pointer-move / pointer-up while a card is being dragged
  useEffect(() => {
    if (!draggingOrder) return

    document.body.style.cursor    = 'grabbing'
    document.body.style.userSelect = 'none'

    const onMove = (e: PointerEvent) => {
      setGhostPos({ x: e.clientX, y: e.clientY })
      const el  = document.elementFromPoint(e.clientX, e.clientY)
      const row = el?.closest('[data-line-id]') as HTMLElement | null
      setDragOverLineId(row?.dataset.lineId ?? null)
    }

    const onUp = (e: PointerEvent) => {
      const el  = document.elementFromPoint(e.clientX, e.clientY)
      const row = el?.closest('[data-line-id]') as HTMLElement | null
      if (row?.dataset.lineId) {
        setPendingDrop({ lineId: row.dataset.lineId, order: draggingOrder })
      }
      setDraggingOrder(null)
      setDragOverLineId(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)

    return () => {
      document.body.style.cursor    = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
    }
  }, [draggingOrder]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Orders fetching ───────────────────────────────────────
  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    fetchOrders()
    const channel = supabase
      .channel('orders-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOrders() {
    let query = supabase.from('orders').select('*').order('updated_at', { ascending: false })
    if (profile?.role === 'worker' && profile.assigned_stage) {
      query = query.eq('current_stage', profile.assigned_stage)
    }
    const { data } = await query
    setOrders(data ?? [])
    setFetching(false)
  }

  const filtered = orders.filter(o => {
    if (search &&
        !o.order_number.toLowerCase().includes(search.toLowerCase()) &&
        !o.customer_name.toLowerCase().includes(search.toLowerCase())) return false
    if (stageFilter !== 'all' && o.current_stage !== stageFilter) return false
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    return true
  })

  const stageLabels: Record<Stage, string> = {
    draft: tr.draft, preparation: tr.preparation,
    cutting_printing: tr.cutting_printing, finishing: tr.finishing, submitted: tr.submitted,
  }

  const canEditGantt = profile?.role === 'manager' || profile?.role === 'worker'

  // Only active finishing orders get a drag handle
  const isDraggableCard = (o: Order) =>
    stageFilter === 'finishing' && o.status === 'active' && canEditGantt

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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Page title */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.orders}</h1>
          {profile?.role === 'manager' && (
            <Link href="/orders/new"
              className="inline-flex items-center gap-2 bg-[#0f1b35] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2d55] transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {tr.newOrder}
            </Link>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-col sm:flex-row gap-3">
          <input
            type="search"
            placeholder={tr.searchOrders}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f1b35]"
          />
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value as Stage | 'all')}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f1b35] bg-white"
          >
            <option value="all">{tr.filterByStage}: {tr.all}</option>
            {STAGES.map(s => (
              <option key={s} value={s}>{stageLabels[s]}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as OrderStatus | 'all')}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f1b35] bg-white"
          >
            <option value="all">{tr.filterByStatus}: {tr.all}</option>
            <option value="active">{tr.active}</option>
            <option value="completed">{tr.completed}</option>
            <option value="cancelled">{tr.cancelled}</option>
          </select>
        </div>

        {/* Stage tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {[{ value: 'all' as const, label: tr.all },
            ...STAGES.map(s => ({ value: s, label: stageLabels[s] }))].map(opt => (
            <button key={opt.value}
              onClick={() => setStageFilter(opt.value as Stage | 'all')}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all',
                stageFilter === opt.value
                  ? 'bg-[#0f1b35] text-white border-[#0f1b35]'
                  : opt.value !== 'all'
                  ? cn(STAGE_COLORS[opt.value as Stage], 'hover:opacity-80')
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              )}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Drag-to-Gantt hint — only shown on Finishing tab for editors */}
        {stageFilter === 'finishing' && canEditGantt && filtered.some(o => o.status === 'active') && (
          <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" className="text-gray-300">
              <circle cx="2.5" cy="2"  r="1.5"/>
              <circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="7"  r="1.5"/>
              <circle cx="7.5" cy="7"  r="1.5"/>
              <circle cx="2.5" cy="12" r="1.5"/>
              <circle cx="7.5" cy="12" r="1.5"/>
            </svg>
            {lang === 'ar'
              ? 'اسحب الطلب إلى خط الإنتاج أدناه لتحديد موعد الإنتاج'
              : "Drag a card's handle to assign it to a production line below"}
          </p>
        )}

        {/* Order cards grid */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <p className="text-gray-500 text-sm">{tr.noOrders}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{filtered.length} {tr.orders.toLowerCase()}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isDragging={draggingOrder?.id === order.id}
                  onDragHandleDown={isDraggableCard(order) ? (e, o) => {
                    setDraggingOrder({ id: o.id, order_number: o.order_number, customer_name: o.customer_name })
                    setGhostPos({ x: e.clientX, y: e.clientY })
                  } : undefined}
                />
              ))}
            </div>
          </>
        )}

        {/* Production planning Gantt — only when Finishing tab is active */}
        {stageFilter === 'finishing' && (
          <ProductionGantt
            canEdit={canEditGantt}
            draggingOrder={draggingOrder}
            dragOverLineId={dragOverLineId}
            pendingDrop={pendingDrop}
            onPendingDropHandled={() => setPendingDrop(null)}
          />
        )}
      </main>

      {/* ── Drag ghost element ────────────────────────────────── */}
      {draggingOrder && (
        <div
          className="fixed z-[9999] pointer-events-none select-none"
          style={{ left: ghostPos.x + 18, top: ghostPos.y - 32 }}
        >
          <div className="bg-[#0f1b35] text-white text-xs font-semibold px-3 py-2 rounded-full shadow-2xl flex items-center gap-2 whitespace-nowrap">
            <svg width="8" height="12" viewBox="0 0 8 12" fill="white" opacity="0.7">
              <circle cx="2" cy="2"  r="1.3"/>
              <circle cx="6" cy="2"  r="1.3"/>
              <circle cx="2" cy="6"  r="1.3"/>
              <circle cx="6" cy="6"  r="1.3"/>
              <circle cx="2" cy="10" r="1.3"/>
              <circle cx="6" cy="10" r="1.3"/>
            </svg>
            {draggingOrder.order_number} — {draggingOrder.customer_name}
          </div>
        </div>
      )}
    </div>
  )
}
