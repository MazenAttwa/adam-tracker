'use client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { StageProgress } from '@/components/orders/StageProgress'
import { StageForm } from '@/components/orders/StageForm'
import { OrderMaterials } from '@/components/orders/OrderMaterials'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmModal } from '@/components/ui/Modal'
import { STAGE_COLORS, STATUS_COLORS, NEXT_STAGE, STAGE_ORDER } from '@/lib/stageConfig'
import { formatDate } from '@/lib/utils'
import type { Order, StageData, Stage } from '@/lib/types'

export default function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params)
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [order, setOrder] = useState<Order | null>(null)
  const [stageDataMap, setStageDataMap] = useState<Record<string, StageData>>({})
  const [activeTab, setActiveTab] = useState<Stage>('draft')
  const [fetching, setFetching] = useState(true)
  const [showAdvance, setShowAdvance] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    fetchOrder()

    const channel = supabase
      .channel(`order-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => fetchOrder())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_data', filter: `order_id=eq.${id}` },
        () => fetchStageData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id, profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOrder() {
    const { data } = await supabase.from('orders').select('*').eq('id', id).single()
    if (data) {
      setOrder(data as Order)
      setActiveTab(data.current_stage as Stage)
    }
    await fetchStageData()
    setFetching(false)
  }

  async function fetchStageData() {
    const { data } = await supabase.from('stage_data').select('*').eq('order_id', id)
    if (data) {
      const map: Record<string, StageData> = {}
      data.forEach((sd: StageData) => { map[sd.stage] = sd })
      setStageDataMap(map)
    }
  }

  async function handleAdvance() {
    if (!order) return
    const next = NEXT_STAGE[order.current_stage]
    if (!next) return
    setAdvancing(true)

    await supabase.from('stage_data').upsert({
      order_id: id,
      stage: order.current_stage,
      is_completed: true,
      completed_by: profile?.id,
      completed_at: new Date().toISOString(),
      data: stageDataMap[order.current_stage]?.data ?? {},
      updated_by: profile?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_id,stage' })

    // Auto-deduct materials when advancing to cutting_printing
    if (next === 'cutting_printing') {
      const { data: orderMats } = await supabase
        .from('order_materials')
        .select('id, material_id, quantity_needed')
        .eq('order_id', id)
        .eq('is_deducted', false)

      if (orderMats && orderMats.length > 0) {
        for (const om of orderMats) {
          await supabase.from('stock_movements').insert({
            material_id: om.material_id,
            type: 'out',
            quantity: om.quantity_needed,
            order_id: id,
            notes: `Auto-deducted for order ${order.order_number}`,
            created_by: profile?.id,
          })
          const { data: mat } = await supabase
            .from('materials')
            .select('current_quantity')
            .eq('id', om.material_id)
            .single()
          if (mat) {
            await supabase.from('materials')
              .update({
                current_quantity: Math.max(0, mat.current_quantity - om.quantity_needed),
                updated_at: new Date().toISOString(),
              })
              .eq('id', om.material_id)
          }
          await supabase.from('order_materials')
            .update({ is_deducted: true })
            .eq('id', om.id)
        }
      }
    }

    const updates: Partial<Order> = { current_stage: next }
    if (next === 'submitted') updates.status = 'completed'

    await supabase.from('orders').update(updates).eq('id', id)

    // Auto-create a revenue entry (amount=0, edit in Finance) when order is submitted
    if (next === 'submitted') {
      await supabase.from('revenue').insert({
        date: new Date().toISOString().split('T')[0],
        type: 'sales',
        amount: 0,
        description: `${order.order_number} — ${order.customer_name}`,
        order_id: id,
        created_by: profile?.id,
      })
    }
    setAdvancing(false)
    setShowAdvance(false)
    await fetchOrder()
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('orders').delete().eq('id', id)
    setDeleting(false)
    setShowDelete(false)
    router.push('/orders')
  }

  function canEditStage(stage: Stage): boolean {
    if (!profile) return false
    if (profile.role === 'customer') return false
    if (profile.role === 'manager') return true
    if (profile.role === 'worker') {
      return profile.assigned_stage === stage && order?.current_stage === stage
    }
    return false
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

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f5f5f0]">
        <Navbar />
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-gray-500">{tr.notFound}</p>
        </div>
      </div>
    )
  }

  const nextStage = NEXT_STAGE[order.current_stage]

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Back */}
        <button onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#0f1b35] mb-6 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {tr.back}
        </button>

        {/* Order header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-[#0f1b35]">{order.order_number}</h1>
                <Badge className={STATUS_COLORS[order.status]}>{tr[order.status]}</Badge>
                <Badge className={STAGE_COLORS[order.current_stage]}>{stageLabels[order.current_stage]}</Badge>
              </div>
              <div className="mt-2 flex flex-col sm:flex-row gap-3 text-sm text-gray-600">
                <span>👤 {order.customer_name}</span>
                {order.customer_phone && <span>📞 {order.customer_phone}</span>}
                <span>📅 {formatDate(order.created_at, lang)}</span>
              </div>
            </div>

            {/* Actions */}
            {profile?.role === 'manager' && (
              <div className="flex gap-2">
                {nextStage && order.status === 'active' && (
                  <Button size="sm" onClick={() => setShowAdvance(true)}>
                    {tr.advance}
                  </Button>
                )}
                <Button size="sm" variant="danger" onClick={() => setShowDelete(true)}>
                  {tr.delete}
                </Button>
              </div>
            )}
          </div>

          {/* Stage progress */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <StageProgress
              currentStage={order.current_stage}
              activeTab={activeTab}
              onStageClick={setActiveTab}
              completedStages={
                Object.entries(stageDataMap)
                  .filter(([, sd]) => sd.is_completed)
                  .map(([s]) => s as Stage)
              }
            />
          </div>
        </div>

        {/* Stage tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {(['draft', 'preparation', 'cutting_printing', 'finishing', 'submitted'] as Stage[]).map(stage => {
            const reachable = STAGE_ORDER[stage] <= STAGE_ORDER[order.current_stage]
            return (
              <button key={stage}
                onClick={() => reachable && setActiveTab(stage)}
                disabled={!reachable}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
                  activeTab === stage
                    ? 'bg-[#0f1b35] text-white border-[#0f1b35]'
                    : reachable
                    ? `${STAGE_COLORS[stage]} hover:opacity-80`
                    : 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                }`}>
                {stageLabels[stage]}
              </button>
            )
          })}
        </div>

        {/* Stage content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-[#0f1b35]">{stageLabels[activeTab]}</h2>
            {stageDataMap[activeTab]?.is_completed && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                ✓ {tr.stageCompleted}
              </Badge>
            )}
          </div>

          <StageForm
            orderId={id}
            stage={activeTab}
            stageData={stageDataMap[activeTab] ?? null}
            canEdit={canEditStage(activeTab)}
            onSaved={fetchStageData}
          />
          {activeTab === 'draft' && (
            <OrderMaterials
              orderId={id}
              canEdit={canEditStage('draft')}
            />
          )}
        </div>
      </main>

      {/* Advance modal */}
      <ConfirmModal
        open={showAdvance}
        onClose={() => setShowAdvance(false)}
        onConfirm={handleAdvance}
        title={tr.advance}
        message={`${tr.advanceConfirm} ${nextStage ? `(→ ${stageLabels[nextStage]})` : ''}`}
        confirmLabel={tr.confirm}
        cancelLabel={tr.cancel}
        loading={advancing}
      />

      {/* Delete modal */}
      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={tr.delete}
        message={tr.deleteConfirm}
        confirmLabel={tr.delete}
        cancelLabel={tr.cancel}
        loading={deleting}
        danger
      />
    </div>
  )
}
