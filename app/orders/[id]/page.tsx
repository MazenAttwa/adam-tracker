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
import { STAGES, STAGE_COLORS, STATUS_COLORS, NEXT_STAGE, STAGE_ORDER } from '@/lib/stageConfig'
import { formatDate } from '@/lib/utils'
import type { Order, StageData, Stage } from '@/lib/types'

function fmtEGP(n: number) {
  return 'EGP ' + n.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

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

  // Cost summary state
  const [materialsCost, setMaterialsCost] = useState(0)
  const [linkedSaleAmount, setLinkedSaleAmount] = useState<number | null>(null)

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

    // Materials cost for Cost Summary
    const { data: omData } = await supabase
      .from('order_materials')
      .select('quantity_needed, materials(cost_per_unit)')
      .eq('order_id', id)
    if (omData) {
      const cost = (omData as unknown as Array<{ quantity_needed: number; materials: { cost_per_unit: number } | null }>)
        .reduce((sum, om) => sum + om.quantity_needed * (om.materials?.cost_per_unit ?? 0), 0)
      setMaterialsCost(cost)
    }

    // Linked sale
    const { data: saleData } = await supabase
      .from('sales')
      .select('total_amount')
      .eq('order_id', id)
      .maybeSingle()
    setLinkedSaleAmount(saleData?.total_amount ?? null)

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

    // Mark current stage complete
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

    // Auto-deduct stock when advancing to Cutting stage
    if (next === 'cutting') {
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

    // When submitted: auto-create revenue entry + manufacturing expense entries
    if (next === 'submitted') {
      const today = new Date().toISOString().split('T')[0]

      // Revenue placeholder (amount=0, edit in Finance)
      await supabase.from('revenue').insert({
        date: today,
        type: 'sales',
        amount: 0,
        description: `${order.order_number} — ${order.customer_name}`,
        order_id: id,
        created_by: profile?.id,
      })

      // Fetch fresh material costs
      const { data: omData } = await supabase
        .from('order_materials')
        .select('quantity_needed, materials(cost_per_unit)')
        .eq('order_id', id)
      const matCost = omData
        ? (omData as unknown as Array<{ quantity_needed: number; materials: { cost_per_unit: number } | null }>)
            .reduce((s, om) => s + om.quantity_needed * (om.materials?.cost_per_unit ?? 0), 0)
        : 0

      // Fabric cost
      const prepData = stageDataMap['preparation']?.data as Record<string, unknown> | undefined
      const fabricCostForExpense = typeof prepData?.fabric_total_cost === 'number' ? prepData.fabric_total_cost : 0

      // Cutting cost
      const cuttingData = stageDataMap['cutting']?.data as Record<string, unknown> | undefined
      const cuttingCostForExpense = typeof cuttingData?.total_cutting_cost === 'number' ? cuttingData.total_cutting_cost : 0

      // Printing cost
      const printingData = stageDataMap['printing']?.data as Record<string, unknown> | undefined
      const printingCostForExpense = typeof printingData?.total_printing_cost === 'number' ? printingData.total_printing_cost : 0

      // Finishing cost
      const finishingData = stageDataMap['finishing']?.data as Record<string, unknown> | undefined
      const finishingCostForExpense = typeof finishingData?.grand_total_finishing_cost === 'number' ? finishingData.grand_total_finishing_cost : 0

      const expenseEntries = [
        { amount: matCost,                 desc: `${order.order_number} — Materials` },
        { amount: fabricCostForExpense,    desc: `${order.order_number} — Fabric` },
        { amount: cuttingCostForExpense,   desc: `${order.order_number} — Cutting` },
        { amount: printingCostForExpense,  desc: `${order.order_number} — Printing` },
        { amount: finishingCostForExpense, desc: `${order.order_number} — Finishing` },
      ].filter(e => e.amount > 0)

      for (const entry of expenseEntries) {
        await supabase.from('expenses').insert({
          date: today,
          category: 'manufacturing',
          amount: entry.amount,
          description: entry.desc,
          created_by: profile?.id,
        })
      }
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
    draft: tr.draft,
    preparation: tr.preparation,
    cutting: tr.cutting,
    printing: tr.printing,
    finishing: tr.finishing,
    submitted: tr.submitted,
    received: tr.received,
  }

  // ── Cost summary derived values ──────────────────────────────────────────
  const fabricCost = (() => {
    const d = stageDataMap['preparation']?.data as Record<string, unknown> | undefined
    return typeof d?.fabric_total_cost === 'number' ? d.fabric_total_cost : 0
  })()
  const cuttingCost = (() => {
    const d = stageDataMap['cutting']?.data as Record<string, unknown> | undefined
    return typeof d?.total_cutting_cost === 'number' ? d.total_cutting_cost : 0
  })()
  const printingCost = (() => {
    const d = stageDataMap['printing']?.data as Record<string, unknown> | undefined
    return typeof d?.total_printing_cost === 'number' ? d.total_printing_cost : 0
  })()
  const finishingCost = (() => {
    const d = stageDataMap['finishing']?.data as Record<string, unknown> | undefined
    return typeof d?.grand_total_finishing_cost === 'number' ? d.grand_total_finishing_cost : 0
  })()
  const totalCost = materialsCost + fabricCost + cuttingCost + printingCost + finishingCost
  const profitEstimate = linkedSaleAmount !== null ? linkedSaleAmount - totalCost : null
  const receivedRevenue = (() => {
    const d = stageDataMap['received']?.data as Record<string, unknown> | undefined
    return typeof d?.total_received_revenue === 'number' ? d.total_received_revenue : 0
  })()
  const grossProfit = receivedRevenue > 0 ? receivedRevenue - totalCost : null
  const hasCostData = totalCost > 0 || linkedSaleAmount !== null || receivedRevenue > 0

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
          {STAGES.map(stage => {
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

          {activeTab === 'preparation' && (
            <>
              <OrderMaterials
                orderId={id}
                canEdit={canEditStage('preparation')}
                onCostChange={setMaterialsCost}
              />
              <hr className="border-gray-100 my-6" />
            </>
          )}
          <StageForm
            orderId={id}
            stage={activeTab}
            stageData={stageDataMap[activeTab] ?? null}
            canEdit={canEditStage(activeTab)}
            onSaved={fetchStageData}
          />
        </div>

        {/* Cost Summary (manager only) */}
        {profile?.role === 'manager' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-6">
            <h2 className="font-semibold text-[#0f1b35] mb-4">{tr.costSummary}</h2>

            {!hasCostData ? (
              <p className="text-sm text-gray-400 text-center py-4">{tr.noCostData}</p>
            ) : (
              <div className="space-y-2">
                {/* Row component */}
                {[
                  { label: tr.materialsCost,  value: materialsCost,  show: materialsCost > 0 },
                  { label: tr.fabricCost,     value: fabricCost,     show: fabricCost > 0 },
                  { label: tr.cuttingCost,    value: cuttingCost,    show: cuttingCost > 0 },
                  { label: tr.printingCost,   value: printingCost,   show: printingCost > 0 },
                  { label: tr.finishingCost,  value: finishingCost,  show: finishingCost > 0 },
                ].map(row => row.show && (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-50">
                    <span className="text-sm text-gray-600">{row.label}</span>
                    <span className="text-sm font-medium text-[#0f1b35] tabular-nums">
                      {fmtEGP(row.value)}
                    </span>
                  </div>
                ))}

                {/* Total */}
                <div className="flex items-center justify-between pt-3">
                  <span className="font-semibold text-[#0f1b35]">{tr.totalOrderCost}</span>
                  <span className="font-bold text-lg text-[#0f1b35] tabular-nums">
                    {fmtEGP(totalCost)}
                  </span>
                </div>

                {/* Received revenue + gross profit */}
                {receivedRevenue > 0 && (
                  <>
                    <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-1">
                      <span className="text-sm text-gray-600">{tr.totalReceivedRevenue}</span>
                      <span className="text-sm font-medium text-emerald-700 tabular-nums">
                        {fmtEGP(receivedRevenue)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="font-semibold text-[#0f1b35]">{tr.grossProfit}</span>
                      <span className={`font-bold text-lg tabular-nums ${
                        (grossProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {grossProfit !== null && grossProfit >= 0 ? '+' : ''}
                        {grossProfit !== null ? fmtEGP(grossProfit) : '—'}
                      </span>
                    </div>
                  </>
                )}

                {/* Linked sale + profit */}
                {linkedSaleAmount !== null && (
                  <>
                    <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-1">
                      <span className="text-sm text-gray-600">{tr.linkedSaleAmount}</span>
                      <span className="text-sm font-medium text-green-700 tabular-nums">
                        {fmtEGP(linkedSaleAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="font-semibold text-[#0f1b35]">{tr.profitEstimate}</span>
                      <span className={`font-bold text-lg tabular-nums ${
                        (profitEstimate ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {profitEstimate !== null && profitEstimate >= 0 ? '+' : ''}
                        {profitEstimate !== null ? fmtEGP(profitEstimate) : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
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
