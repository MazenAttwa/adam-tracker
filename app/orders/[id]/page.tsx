'use client'
import { useEffect, useState, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { useToast } from '@/contexts/ToastContext'
import { Navbar } from '@/components/layout/Navbar'
import { StageProgress } from '@/components/orders/StageProgress'
import { StageForm } from '@/components/orders/StageForm'
import { OrderMaterials } from '@/components/orders/OrderMaterials'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { ConfirmModal, Modal } from '@/components/ui/Modal'
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
  const { showToast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [order, setOrder] = useState<Order | null>(null)
  const [stageDataMap, setStageDataMap] = useState<Record<string, StageData>>({})
  const [activeTab, setActiveTab] = useState<Stage>('draft')
  const revenueSyncedRef = useRef<string | null>(null)
  const [fetching, setFetching] = useState(true)
  const [showAdvance, setShowAdvance] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState({ order_number: '', customer_name: '', customer_phone: '', created_at: '' })
  const [duplicating, setDuplicating] = useState(false)

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

  // Once an order is at 'received' with a value, make sure it's counted as revenue (no manual save needed)
  useEffect(() => {
    if (!order || order.current_stage !== 'received') return
    if (!stageDataMap['received']) return
    if (revenueSyncedRef.current === order.id) return
    revenueSyncedRef.current = order.id
    void syncReceivedRevenue()
  }, [order, stageDataMap]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleStageSaved() {
    await fetchStageData()
    if (activeTab === 'received') await recordSaleFromReceived()
  }

  // Auto-record a Sale (direct customer, no retailer) when the Received stage has revenue
  // Reflect a received order's value in the Revenue table (silent, idempotent)
  async function syncReceivedRevenue() {
    if (!order || order.current_stage !== 'received') return
    const d = stageDataMap['received']?.data as Record<string, unknown> | undefined
    const revenue = typeof d?.total_received_revenue === 'number' ? d.total_received_revenue : 0
    if (revenue <= 0) return
    const receivedDate = typeof d?.received_date === 'string' && d.received_date
      ? d.received_date : new Date().toISOString().split('T')[0]
    const { data: revRows } = await supabase.from('revenue').select('id, amount').eq('order_id', id).limit(1)
    const existing = revRows && revRows.length > 0 ? (revRows[0] as { id: string; amount: number }) : null
    if (existing) {
      if (existing.amount !== revenue) {
        await supabase.from('revenue').update({ amount: revenue, date: receivedDate }).eq('id', existing.id)
      }
    } else {
      await supabase.from('revenue').insert({
        date: receivedDate, type: 'sales', amount: revenue,
        description: `${order.order_number} — ${order.customer_name}`,
        order_id: id, created_by: profile?.id,
      })
    }
  }

  async function recordSaleFromReceived() {
    if (!order) return
    const { data: rd } = await supabase
      .from('stage_data').select('data').eq('order_id', id).eq('stage', 'received').maybeSingle()
    const d = (rd?.data ?? {}) as Record<string, unknown>
    const revenue = typeof d.total_received_revenue === 'number' ? d.total_received_revenue : 0
    if (revenue <= 0) return
    const pricePer = typeof d.price_per_piece === 'number' ? d.price_per_piece : 0
    const qty = typeof d.quantity_received === 'number' ? d.quantity_received : 0
    const receivedDate = typeof d.received_date === 'string' && d.received_date
      ? d.received_date : new Date().toISOString().split('T')[0]

    // Reflect the received revenue in the P&L so Reports/profit are correct
    const { data: revRows } = await supabase.from('revenue').select('id').eq('order_id', id).limit(1)
    const existingRevId = revRows && revRows.length > 0 ? (revRows[0] as { id: string }).id : null
    if (existingRevId) {
      await supabase.from('revenue').update({ amount: revenue, date: receivedDate }).eq('id', existingRevId)
    } else {
      await supabase.from('revenue').insert({
        date: receivedDate,
        type: 'sales',
        amount: revenue,
        description: `${order.order_number} — ${order.customer_name}`,
        order_id: id,
        created_by: profile?.id,
      })
    }

    const item = { name: order.customer_name || order.order_number, quantity: qty, unit_price: pricePer, total: revenue }
    const { data: existing } = await supabase.from('sales').select('id').eq('order_id', id).maybeSingle()
    if (existing) {
      await supabase.from('sales').update({
        customer_name: order.customer_name,
        date: receivedDate,
        items: [item],
        total_amount: revenue,
        delivery_status: 'delivered',
        delivery_date: receivedDate,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      const { error } = await supabase.from('sales').insert({
        invoice_number: order.order_number,
        date: receivedDate,
        retailer_id: null,
        customer_name: order.customer_name,
        order_id: id,
        items: [item],
        total_amount: revenue,
        delivery_status: 'delivered',
        delivery_date: receivedDate,
        created_by: profile?.id,
      })
      if (error) { showToast(error.message, 'error'); return }
      showToast(tr.savedOk)
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
    if (next === 'received') updates.status = 'completed'
    const { error: advErr } = await supabase.from('orders').update(updates).eq('id', id)
    if (advErr) { showToast(tr.error, 'error'); setAdvancing(false); return }

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
          order_id: id,
          created_by: profile?.id,
        })
      }
    }

    setAdvancing(false)
    setShowAdvance(false)
    await fetchOrder()
    showToast(tr.savedOk)
  }

  async function handleDuplicate() {
    if (!order) return
    setDuplicating(true)

    // Create a fresh order (DB trigger assigns a new order number)
    const { data: newOrder, error: e0 } = await supabase
      .from('orders')
      .insert({
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        current_stage: 'draft',
        status: 'active',
        created_by: profile?.id,
        order_number: '',
      })
      .select()
      .single()
    if (e0 || !newOrder) {
      setDuplicating(false)
      showToast(lang === 'ar' ? 'تعذر نسخ الطلب' : 'Could not copy order', 'error')
      return
    }
    const newId = newOrder.id

    // Copy child rows, stripping ids and re-pointing to the new order
    const reparent = (rows: unknown[] | null, overrides: Record<string, unknown>) =>
      (rows ?? []).map(r => {
        const c = { ...(r as Record<string, unknown>) }
        delete c.id
        delete c.created_at
        delete c.updated_at
        c.order_id = newId
        return { ...c, ...overrides }
      })

    const { data: sd } = await supabase.from('stage_data').select('*').eq('order_id', id).eq('stage', 'draft')
    const sdRows = reparent(sd, { is_completed: false, completed_by: null, completed_at: null })
    if (sdRows.length) await supabase.from('stage_data').insert(sdRows)

    // Materials, finishing manufacturers, and all production-stage costs are NOT copied:
    // a duplicate starts as a clean draft with an empty Cost Summary (re-select materials per order).

    const { data: ph } = await supabase.from('order_photos').select('*').eq('order_id', id)
    for (const raw of (ph ?? []) as Record<string, unknown>[]) {
      const srcPath = raw.file_path as string
      let newPath = srcPath
      // Copy the physical file so the duplicate owns an independent copy
      const dl = await supabase.storage.from('product-photos').download(srcPath)
      if (dl.data) {
        const ext = srcPath.split('.').pop() ?? 'jpg'
        newPath = `/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        await supabase.storage.from('product-photos').upload(newPath, dl.data)
      }
      await supabase.from('order_photos').insert({
        order_id: newId,
        file_path: newPath,
        file_name: raw.file_name,
        uploaded_by: profile?.id,
      })
    }

    setDuplicating(false)
    router.push(`/orders/${newId}`)
  }

  function openEditOrder() {
    if (!order) return
    setEditForm({
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone ?? '',
      created_at: order.created_at ? order.created_at.slice(0, 10) : '',
    })
    setShowEdit(true)
  }

  async function handleEditSave() {
    if (!order) return
    setSavingEdit(true)
    const { error } = await supabase.from('orders').update({
      order_number: editForm.order_number.trim(),
      customer_name: editForm.customer_name.trim(),
      customer_phone: editForm.customer_phone.trim() || null,
      created_at: editForm.created_at || order.created_at,
    }).eq('id', order.id)
    setSavingEdit(false)
    if (error) { showToast(error.message, 'error'); return }
    setShowEdit(false)
    showToast(tr.savedOk)
    await fetchOrder()
  }

  async function handleDelete() {
    setDeleting(true)

    // Restore stock for any materials this order deducted (add the quantities back)
    const { data: deductedMats } = await supabase
      .from('order_materials')
      .select('material_id, quantity_needed')
      .eq('order_id', id)
      .eq('is_deducted', true)
    if (deductedMats && deductedMats.length > 0) {
      for (const om of deductedMats as { material_id: string; quantity_needed: number }[]) {
        const { data: mat } = await supabase
          .from('materials')
          .select('current_quantity')
          .eq('id', om.material_id)
          .single()
        if (mat) {
          await supabase.from('materials')
            .update({
              current_quantity: (mat.current_quantity ?? 0) + om.quantity_needed,
              updated_at: new Date().toISOString(),
            })
            .eq('id', om.material_id)
        }
      }
    }

    // Remove all linked records first so foreign keys do not block the delete (full cleanup)
    await supabase.from('stock_movements').delete().eq('order_id', id)
    await supabase.from('order_materials').delete().eq('order_id', id)
    await supabase.from('finishing_manufacturers').delete().eq('order_id', id)
    // Remove order photo files from storage before deleting their rows (avoid orphans)
    const { data: ordPhotos } = await supabase.from('order_photos').select('file_path').eq('order_id', id)
    const myPaths = ((ordPhotos ?? []) as { file_path: string }[]).map(p => p.file_path).filter(Boolean)
    // Only remove files that no OTHER order still references (duplicated orders can share files)
    if (myPaths.length) {
      const { data: others } = await supabase.from('order_photos').select('file_path').in('file_path', myPaths).neq('order_id', id)
      const sharedPaths = new Set(((others ?? []) as { file_path: string }[]).map(p => p.file_path))
      const safeToRemove = myPaths.filter(p => !sharedPaths.has(p))
      if (safeToRemove.length) await supabase.storage.from('product-photos').remove(safeToRemove)
    }
    await supabase.from('order_photos').delete().eq('order_id', id)
    await supabase.from('production_assignments').delete().eq('order_id', id)
    await supabase.from('revenue').delete().eq('order_id', id)
    await supabase.from('expenses').delete().eq('order_id', id)
    await supabase.from('sales').delete().eq('order_id', id)
    await supabase.from('stage_data').delete().eq('order_id', id)

    const { error } = await supabase.from('orders').delete().eq('id', id)
    setDeleting(false)
    setShowDelete(false)
    if (error) {
      showToast(lang === 'ar' ? 'تعذر حذف الطلب: ' + error.message : 'Could not delete order: ' + error.message, 'error')
      return
    }
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
  const logisticsCost = (['preparation', 'cutting', 'printing', 'finishing', 'submitted'] as const).reduce((sum, st) => {
    const d = stageDataMap[st]?.data as Record<string, unknown> | undefined
    return sum + (typeof d?.logistic_cost === 'number' ? d.logistic_cost : 0)
  }, 0)
  const totalCost = materialsCost + fabricCost + cuttingCost + printingCost + finishingCost + logisticsCost
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
                {nextStage && order.status !== 'cancelled' && (
                  <Button size="sm" onClick={() => setShowAdvance(true)}>
                    {tr.advance}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={openEditOrder}>
                  {tr.edit}
                </Button>
                <Button size="sm" variant="secondary" onClick={handleDuplicate} disabled={duplicating}>
                  {tr.duplicate}
                </Button>
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
            onSaved={handleStageSaved}
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
                  { label: tr.logistics,      value: logisticsCost,  show: logisticsCost > 0 },
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

      {/* Edit order modal */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title={tr.editOrder}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowEdit(false)} disabled={savingEdit}>{tr.cancel}</Button>
            <Button onClick={handleEditSave} loading={savingEdit}>{tr.save}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label={tr.orderNumber} value={editForm.order_number} onChange={e => setEditForm({ ...editForm, order_number: e.target.value })} />
          <Input label={tr.customerName} value={editForm.customer_name} onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })} />
          <Input label={tr.customerPhone} value={editForm.customer_phone} onChange={e => setEditForm({ ...editForm, customer_phone: e.target.value })} />
          <Input label={tr.date} type="date" value={editForm.created_at} onChange={e => setEditForm({ ...editForm, created_at: e.target.value })} />
        </div>
      </Modal>

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
