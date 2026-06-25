'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import type { ProductionLine, ProductionAssignment } from '@/lib/types'

const DAY_WIDTH = 56
const WINDOW_DAYS = 21
const PAST_DAYS = 7
const DEFAULT_LINE_COUNT = 5

const LINE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#ec4899', '#06b6d4', '#65a30d',
]

const SHORT_MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const SHORT_MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

interface FinishingOrder { id: string; order_number: string; customer_name: string }
interface AssignmentForm {
  order_id: string; order_name: string
  start_date: string; end_date: string
  estimated_hours: string; quantity: string
}
export interface DragOrder { id: string; order_number: string; customer_name: string }

function getMidnight(offsetDays = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d
}

interface Props {
  canEdit: boolean
  draggingOrder?: DragOrder | null
  dragOverLineId?: string | null
  pendingDrop?: { lineId: string; order: DragOrder } | null
  onPendingDropHandled?: () => void
  stage?: 'finishing' | 'cutting'
}

export function ProductionGantt({
  canEdit,
  draggingOrder,
  dragOverLineId,
  pendingDrop,
  onPendingDropHandled,
  stage = 'finishing',
}: Props) {
  const supabase = createClient()
  const { profile } = useAuth()
  const { tr, lang } = useLang()
  const scrollRef = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)
  const didInitRef = useRef(false)

  const [lines, setLines] = useState<ProductionLine[]>([])
  const [assignments, setAssignments] = useState<ProductionAssignment[]>([])
  const [finishingOrders, setFinishingOrders] = useState<FinishingOrder[]>([])
  const [orderPhotos, setOrderPhotos] = useState<Record<string, string | null>>({})
  const [dataLoaded, setDataLoaded] = useState(false)

  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editingLineName, setEditingLineName] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [selectedAssignment, setSelectedAssignment] = useState<ProductionAssignment | null>(null)
  const [saving, setSaving] = useState(false)
  const [flashingLineId, setFlashingLineId] = useState<string | null>(null)
  const [form, setForm] = useState<AssignmentForm>({
    order_id: '', order_name: '', start_date: '', end_date: '',
    estimated_hours: '', quantity: '',
  })

  const today = getMidnight(0)
  const windowStart = getMidnight(-PAST_DAYS)
  const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => getMidnight(i - PAST_DAYS))
  const todayLineX = PAST_DAYS * DAY_WIDTH + DAY_WIDTH / 2
  const shortMonths = lang === 'ar' ? SHORT_MONTHS_AR : SHORT_MONTHS_EN

  // ── Data fetching ─────────────────────────────────────────
  async function fetchData() {
    const [linesRes, assignmentsRes, ordersRes] = await Promise.all([
      supabase.from('production_lines').select('*').eq('stage', stage).order('display_order').order('created_at'),
      supabase.from('production_assignments').select('*').eq('stage', stage).order('start_date'),
      supabase.from('orders')
        .select('id, order_number, customer_name')
        .eq('current_stage', stage)
        .eq('status', 'active'),
    ])
    const fetchedLines = (linesRes.data ?? []) as ProductionLine[]
    const fetchedOrders = (ordersRes.data ?? []) as FinishingOrder[]
    setLines(fetchedLines)
    setAssignments((assignmentsRes.data ?? []) as ProductionAssignment[])
    setFinishingOrders(fetchedOrders)
    setDataLoaded(true)

    // Fetch one photo per finishing order
    const orderIds = fetchedOrders.map(o => o.id)
    if (orderIds.length > 0) {
      const { data: photosData } = await supabase
        .from('order_photos')
        .select('order_id, file_path')
        .in('order_id', orderIds)
        .order('uploaded_at', { ascending: true })
      const map: Record<string, string | null> = {}
      if (photosData) {
        for (const p of photosData as { order_id: string; file_path: string }[]) {
          if (!map[p.order_id]) {
            const { data } = supabase.storage.from('product-photos').getPublicUrl(p.file_path)
            map[p.order_id] = data.publicUrl
          }
        }
      }
      for (const id of orderIds) {
        if (!(id in map)) map[id] = null
      }
      setOrderPhotos(map)
    } else {
      setOrderPhotos({})
    }

    return fetchedLines
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      const fetchedLines = await fetchData()
      if (!cancelled && fetchedLines.length === 0 && canEdit && !didInitRef.current) {
        didInitRef.current = true
        const defaults = Array.from({ length: DEFAULT_LINE_COUNT }, (_, i) => ({
          name: `Line ${i + 1}`,
          display_order: i,
          stage,
          created_by: profile?.id ?? null,
        }))
        await supabase.from('production_lines').insert(defaults)
        await fetchData()
      }
    }
    init()

    const channel = supabase
      .channel(`production-gantt-${stage}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_lines' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_assignments' }, fetchData)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll so today is visible after first load
  useEffect(() => {
    if (dataLoaded && !didScrollRef.current && scrollRef.current) {
      const el = scrollRef.current
      el.scrollLeft = Math.max(0, todayLineX - el.clientWidth / 3)
      didScrollRef.current = true
    }
  }, [dataLoaded, todayLineX])

  // Open modal pre-filled when an order card is dropped onto a line
  useEffect(() => {
    if (!pendingDrop) return
    const todayStr = getMidnight(0).toISOString().split('T')[0]
    const endStr   = getMidnight(3).toISOString().split('T')[0]
    setSelectedLineId(pendingDrop.lineId)
    setSelectedAssignment(null)
    setForm({
      order_id:        pendingDrop.order.id,
      order_name:      `${pendingDrop.order.order_number} — ${pendingDrop.order.customer_name}`,
      start_date:      todayStr,
      end_date:        endStr,
      estimated_hours: '',
      quantity:        '',
    })
    setShowModal(true)
  }, [pendingDrop]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Line CRUD ─────────────────────────────────────────────
  async function addLine() {
    await supabase.from('production_lines').insert({
      name: `Line ${lines.length + 1}`,
      display_order: lines.length,
      stage,
      created_by: profile?.id,
    })
    fetchData()
  }

  async function deleteLine(lineId: string) {
    await supabase.from('production_lines').delete().eq('id', lineId)
    fetchData()
  }

  async function saveLineName(lineId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) { setEditingLineId(null); return }
    await supabase.from('production_lines').update({ name: trimmed }).eq('id', lineId)
    setEditingLineId(null)
    fetchData()
  }

  // ── Assignment CRUD ───────────────────────────────────────
  function openAddModal(lineId: string) {
    const todayStr = today.toISOString().split('T')[0]
    setSelectedLineId(lineId)
    setSelectedAssignment(null)
    setForm({ order_id: '', order_name: '', start_date: todayStr, end_date: todayStr,
              estimated_hours: '', quantity: '' })
    setShowModal(true)
  }

  function openEditModal(a: ProductionAssignment) {
    const orderInList = a.order_id && finishingOrders.some(o => o.id === a.order_id)
    setSelectedLineId(a.line_id)
    setSelectedAssignment(a)
    setForm({
      order_id:        orderInList ? (a.order_id ?? '') : '',
      order_name:      a.order_name,
      start_date:      a.start_date,
      end_date:        a.end_date,
      estimated_hours: a.estimated_hours ? String(a.estimated_hours) : '',
      quantity:        a.quantity ? String(a.quantity) : '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setSelectedAssignment(null)
    setSelectedLineId(null)
    onPendingDropHandled?.()
  }

  function resolveOrderName() {
    if (form.order_id) {
      const o = finishingOrders.find(x => x.id === form.order_id)
      if (o) return `${o.order_number} — ${o.customer_name}`
    }
    return form.order_name.trim()
  }

  async function saveAssignment() {
    if (!form.start_date || !form.end_date || !selectedLineId) return
    if (form.end_date < form.start_date) return
    const label = resolveOrderName()
    if (!label) return
    setSaving(true)
    const isNew = !selectedAssignment
    const savedLineId = selectedLineId  // capture before closeModal clears it

    const payload = {
      stage,
      line_id:          selectedLineId,
      order_id:         form.order_id || null,
      order_name:       label,
      start_date:       form.start_date,
      end_date:         form.end_date,
      estimated_hours:  Number(form.estimated_hours) || 0,
      quantity:         Number(form.quantity) || 0,
      created_by:       profile?.id,
    }

    if (selectedAssignment) {
      await supabase.from('production_assignments').update(payload).eq('id', selectedAssignment.id)
    } else {
      await supabase.from('production_assignments').insert(payload)
    }

    setSaving(false)
    closeModal()
    fetchData()

    // Green flash on the line that just got a new assignment
    if (isNew && savedLineId) {
      setFlashingLineId(savedLineId)
      setTimeout(() => setFlashingLineId(null), 800)
    }
  }

  async function deleteAssignment() {
    if (!selectedAssignment) return
    await supabase.from('production_assignments').delete().eq('id', selectedAssignment.id)
    closeModal()
    fetchData()
  }

  // ── Bar geometry ──────────────────────────────────────────
  function getBarPos(a: ProductionAssignment): { left: number; width: number } | null {
    const winMs    = windowStart.getTime()
    const startIdx = Math.round((new Date(a.start_date + 'T00:00:00').getTime() - winMs) / 86400000)
    const endIdx   = Math.round((new Date(a.end_date   + 'T00:00:00').getTime() - winMs) / 86400000) + 1
    const cStart   = Math.max(0, startIdx)
    const cEnd     = Math.min(WINDOW_DAYS, endIdx)
    if (cStart >= cEnd) return null
    return { left: cStart * DAY_WIDTH, width: (cEnd - cStart) * DAY_WIDTH }
  }

  function barLabel(a: ProductionAssignment, width: number) {
    if (width < 28) return ''
    const meta = [a.quantity ? `${a.quantity}pcs` : '', a.estimated_hours ? `${a.estimated_hours}h` : '']
      .filter(Boolean).join(' · ')
    if (width >= 160 && meta) return `${a.order_name}  ${meta}`
    return a.order_name
  }

  // ── Summary stats ─────────────────────────────────────────
  const linesInUse  = lines.filter(l => assignments.some(a => a.line_id === l.id)).length
  const totalPieces = assignments.reduce((s, a) => s + (a.quantity || 0), 0)
  const totalHours  = assignments.reduce((s, a) => s + (a.estimated_hours || 0), 0)

  const dateError = form.end_date && form.start_date && form.end_date < form.start_date

  // ── Row class helpers ─────────────────────────────────────
  function leftRowClass(lineId: string) {
    if (dragOverLineId === lineId)  return 'bg-blue-50 border-l-[3px] border-l-blue-400 border-b-gray-100'
    if (flashingLineId === lineId)  return 'bg-green-50 border-l-[3px] border-l-green-400 border-b-gray-100'
    if (draggingOrder)              return 'border-b border-gray-100 hover:bg-blue-50/40 cursor-copy'
    return 'border-b border-gray-100'
  }

  function chartRowClass(lineId: string) {
    if (dragOverLineId === lineId)  return 'bg-blue-50/50'
    if (flashingLineId === lineId)  return 'bg-green-50/50'
    return ''
  }

  return (
    <div className="mt-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[#0f1b35]">{tr.productionPlan}</h2>
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={addLine}>
            + {tr.addLine}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: tr.finishing,   value: finishingOrders.length },
          { label: tr.totalPieces, value: totalPieces || '—' },
          { label: tr.totalHours,  value: totalHours > 0 ? `${totalHours}h` : '—' },
          { label: tr.activeLines, value: linesInUse },
        ].map(c => (
          <div key={c.label} className="bg-[#0f1b35]/5 rounded-xl p-3">
            <div className="text-2xl font-bold text-[#0f1b35]">{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Gantt board — ring highlights while dragging */}
      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${
        draggingOrder ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'
      }`}>
        {/* Drop hint banner */}
        {draggingOrder && (
          <div className="text-center text-xs font-medium text-blue-600 py-2 bg-blue-50 border-b border-blue-100 select-none">
            {lang === 'ar' ? '↓ أفلت الطلب على أحد الخطوط لتحديد موعده' : '↓ Drop on a line to assign'}
          </div>
        )}

        {!dataLoaded ? (
          <div className="h-24 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#c9a84c] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex">

            {/* ── Left: line names ─────────────────────────────── */}
            <div className="w-40 sm:w-52 flex-shrink-0 border-r border-gray-200 bg-gray-50/60">
              <div className="h-10 px-3 flex items-center border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{tr.line}</span>
              </div>

              {lines.map((line, idx) => {
                const color = LINE_COLORS[idx % LINE_COLORS.length]
                const hasAssignments = assignments.some(a => a.line_id === line.id)
                return (
                  <div
                    key={line.id}
                    data-line-id={line.id}
                    className={`h-12 px-2 flex items-center gap-2 transition-colors duration-150 group/row ${leftRowClass(line.id)}`}
                  >
                    <div className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: color }} />

                    {editingLineId === line.id ? (
                      <input
                        autoFocus
                        className="flex-1 min-w-0 text-sm text-[#0f1b35] bg-white border border-[#0f1b35] rounded px-1.5 py-0.5 outline-none"
                        value={editingLineName}
                        onChange={e => setEditingLineName(e.target.value)}
                        onBlur={() => saveLineName(line.id, editingLineName || line.name)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveLineName(line.id, editingLineName || line.name)
                          if (e.key === 'Escape') setEditingLineId(null)
                        }}
                      />
                    ) : (
                      <button
                        className={`flex-1 min-w-0 text-sm text-left truncate transition-colors ${
                          canEdit ? 'text-[#0f1b35] hover:text-[#c9a84c]' : 'text-[#0f1b35] cursor-default'
                        }`}
                        title={canEdit ? tr.clickToRename : line.name}
                        onClick={() => {
                          if (!canEdit) return
                          setEditingLineId(line.id)
                          setEditingLineName(line.name)
                        }}
                      >
                        {line.name}
                      </button>
                    )}

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {canEdit && (
                        <button
                          onClick={() => openAddModal(line.id)}
                          className="text-xs font-bold text-[#0f1b35]/40 hover:text-[#0f1b35] bg-white border border-gray-200 hover:border-gray-400 rounded px-1.5 py-0.5 transition-colors leading-none"
                          title={tr.addAssignment}
                        >
                          +
                        </button>
                      )}
                      {canEdit && !hasAssignments && (
                        <button
                          onClick={() => deleteLine(line.id)}
                          className="text-red-300 hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-all"
                          title={tr.deleteLine}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {lines.length === 0 && (
                <div className="h-16 flex items-center justify-center px-4">
                  <span className="text-xs text-gray-400 text-center">{tr.noLines}</span>
                </div>
              )}
            </div>

            {/* ── Right: scrollable timeline (always LTR) ──────── */}
            <div className="flex-1 overflow-x-auto" ref={scrollRef} dir="ltr">
              <div style={{ width: WINDOW_DAYS * DAY_WIDTH, position: 'relative' }}>

                {/* Date header */}
                <div className="h-10 flex border-b border-gray-100 bg-gray-50/60 relative">
                  {dates.map((d, i) => {
                    const isToday   = d.getTime() === today.getTime()
                    const showMonth = i === 0 || d.getDate() === 1
                    return (
                      <div
                        key={i}
                        style={{ width: DAY_WIDTH, flexShrink: 0 }}
                        className={`flex flex-col items-center justify-center border-r border-gray-100 ${isToday ? 'bg-red-50' : ''}`}
                      >
                        {showMonth && (
                          <span className="text-[10px] text-gray-400 leading-none">{shortMonths[d.getMonth()]}</span>
                        )}
                        <span className={`text-xs leading-tight ${isToday ? 'font-bold text-red-600' : 'text-gray-400'}`}>
                          {d.getDate()}
                        </span>
                      </div>
                    )
                  })}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                    style={{ left: todayLineX }}
                  />
                </div>

                {/* One chart row per line */}
                {lines.map((line, lineIdx) => {
                  const color = LINE_COLORS[lineIdx % LINE_COLORS.length]
                  const lineAssignments = assignments.filter(a => a.line_id === line.id)
                  return (
                    <div
                      key={line.id}
                      data-line-id={line.id}
                      className={`relative border-b border-gray-100 transition-colors duration-150 ${chartRowClass(line.id)}`}
                      style={{ height: 48 }}
                    >
                      {/* Day backgrounds */}
                      {dates.map((d, i) => {
                        const isToday   = d.getTime() === today.getTime()
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6
                        return (
                          <div
                            key={i}
                            style={{ position: 'absolute', left: i * DAY_WIDTH, width: DAY_WIDTH, top: 0, bottom: 0 }}
                            className={`border-r border-gray-50 ${isToday ? 'bg-red-50/30' : isWeekend ? 'bg-gray-100/50' : ''}`}
                          />
                        )
                      })}

                      {/* Today line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-400/50 z-10 pointer-events-none"
                        style={{ left: todayLineX }}
                      />

                      {/* Assignment bars */}
                      {lineAssignments.map(a => {
                        const pos = getBarPos(a)
                        if (!pos) return null
                        const bw = Math.max(pos.width - 6, 4)
                        const tooltip = [
                          a.order_name,
                          a.quantity       ? `${a.quantity} pcs` : '',
                          a.estimated_hours ? `${a.estimated_hours}h` : '',
                        ].filter(Boolean).join(' · ')
                        const label = barLabel(a, bw)
                        const showPhoto = bw >= 40
                        const barPhotoUrl = a.order_id ? (orderPhotos[a.order_id] ?? null) : null
                        return (
                          <button
                            key={a.id}
                            onClick={() => openEditModal(a)}
                            style={{
                              position: 'absolute',
                              left: pos.left + 3,
                              width: bw,
                              top: '18%',
                              height: '64%',
                              backgroundColor: color,
                              borderRadius: 5,
                              zIndex: 20,
                            }}
                            className="flex items-center gap-1 px-1.5 text-white text-xs overflow-hidden hover:brightness-110 active:brightness-90 transition-all shadow-sm focus:outline-none"
                            title={tooltip}
                          >
                            {showPhoto && (
                              barPhotoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={barPhotoUrl} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                              ) : (
                                <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center bg-white/20 text-[8px] font-bold leading-none">
                                  {a.order_name.charAt(0).toUpperCase()}
                                </span>
                              )
                            )}
                            {label && <span className="truncate">{label}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}

                {lines.length === 0 && (
                  <div style={{ height: 80 }} className="flex items-center justify-center">
                    <span className="text-sm text-gray-300 select-none">─ ─ ─</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Add / Edit modal ─────────────────────────────────── */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={selectedAssignment ? tr.editAssignment : tr.addAssignment}
        footer={
          <>
            <div className="flex-1 flex items-center">
              {selectedAssignment && canEdit && (
                <Button variant="danger" size="sm" onClick={deleteAssignment}>
                  {tr.delete}
                </Button>
              )}
            </div>
            <Button variant="ghost" onClick={closeModal} disabled={saving}>{tr.cancel}</Button>
            {canEdit && (
              <Button onClick={saveAssignment} loading={saving} disabled={!!dateError}>{tr.save}</Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {/* Order photo shown in modal header when a finishing order is selected */}
          {form.order_id && (
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              {orderPhotos[form.order_id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={orderPhotos[form.order_id]!}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-[#0f1b35]/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold text-[#0f1b35]/40 select-none">
                    {form.order_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-[#0f1b35] text-sm truncate">{form.order_name}</p>
                <p className="text-xs text-gray-400">
                  {selectedLineId && lines.find(l => l.id === selectedLineId)?.name}
                </p>
              </div>
            </div>
          )}

          <Select
            label={tr.ganttOrderLabel}
            value={form.order_id}
            disabled={!canEdit}
            onChange={e => {
              const o = finishingOrders.find(x => x.id === e.target.value)
              setForm(f => ({
                ...f,
                order_id:   e.target.value,
                order_name: o ? `${o.order_number} — ${o.customer_name}` : f.order_name,
              }))
            }}
          >
            <option value="">{tr.noOrder}</option>
            {finishingOrders.map(o => (
              <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>
            ))}
          </Select>

          {!form.order_id && (
            <Input
              label={tr.customOrderName}
              value={form.order_name}
              disabled={!canEdit}
              onChange={e => setForm(f => ({ ...f, order_name: e.target.value }))}
              placeholder="e.g. Kafr El-Dawar batch, Rush set…"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label={tr.ganttStartDate} type="date" value={form.start_date} disabled={!canEdit}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            <Input label={tr.ganttEndDate} type="date" value={form.end_date} disabled={!canEdit}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              error={dateError ? 'Must be ≥ start date' : undefined} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label={tr.estimatedHours} type="number" min="0" step="0.5"
              value={form.estimated_hours} disabled={!canEdit} placeholder="0"
              onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} />
            <Input label={tr.assignmentQty} type="number" min="0"
              value={form.quantity} disabled={!canEdit} placeholder="0"
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
