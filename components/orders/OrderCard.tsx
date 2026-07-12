'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLang } from '@/contexts/LanguageContext'
import { Badge } from '@/components/ui/Badge'
import { STAGE_COLORS, STATUS_COLORS, STAGE_ORDER, STAGES } from '@/lib/stageConfig'
import { formatDate } from '@/lib/utils'
import type { Order, Stage } from '@/lib/types'

interface OrderCardProps {
  order: Order
  isDragging?: boolean
  onDragHandleDown?: (e: React.PointerEvent, order: Order) => void
}

export function OrderCard({ order, isDragging, onDragHandleDown }: OrderCardProps) {
  const { tr, lang } = useLang()
  const stageIndex = STAGE_ORDER[order.current_stage]
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [journey, setJourney] = useState<{ label: string; qty: number }[] | null>(null)

  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    supabase
      .from('order_photos')
      .select('file_path')
      .eq('order_id', order.id)
      .order('uploaded_at', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (!mounted || !data || data.length === 0) return
        const { data: urlData } = supabase.storage.from('product-photos').getPublicUrl(data[0].file_path)
        setPhotoUrl(urlData.publicUrl)
      })

    // Piece journey (quantity through the stages)
    supabase
      .from('stage_data')
      .select('stage, data')
      .eq('order_id', order.id)
      .then(({ data }) => {
        if (!mounted || !data) return
        const map: Record<string, Record<string, unknown>> = {}
        ;(data as { stage: string; data: Record<string, unknown> }[]).forEach(r => { map[r.stage] = r.data ?? {} })
        const num = (stage: string, key: string) => {
          const v = map[stage]?.[key]
          return typeof v === 'number' ? v : 0
        }
        const arr = map['finishing']?.['manufacturers']
        const finishing = Array.isArray(arr)
          ? (arr as { quantity?: number }[]).reduce((s, m) => s + (m.quantity ?? 0), 0)
          : 0
        const steps = [
          { label: 'D', qty: num('draft', 'quantity') },
          { label: 'C', qty: num('cutting', 'quantity_to_cut') },
          { label: 'P', qty: num('printing', 'quantity_to_print') },
          { label: 'F', qty: finishing },
          { label: 'S', qty: num('submitted', 'quantity_submitted') },
          { label: 'R', qty: num('received', 'quantity_received') },
        ]
        if (steps[0].qty > 0) setJourney(steps)
      })

    return () => { mounted = false }
  }, [order.id])

  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(order.updated_at).getTime()) / 86_400_000
  )
  const cardBorder =
    order.status === 'completed'
      ? 'border-green-200 bg-green-50/40'
      : order.status === 'cancelled'
      ? 'border-gray-200 opacity-60'
      : daysSinceUpdate > 30
      ? 'border-red-200 bg-red-50/30'
      : daysSinceUpdate > 7
      ? 'border-amber-200 bg-amber-50/30'
      : 'border-gray-100 bg-white'

  const stageLabels: Record<Stage, string> = {
    draft: tr.draft,
    preparation: tr.preparation,
    cutting: tr.cutting,
    printing: tr.printing,
    finishing: tr.finishing,
    submitted: tr.submitted, received: tr.received,
  }

  return (
    <div className={`relative transition-opacity duration-150 ${isDragging ? 'opacity-60' : ''}`}
         style={isDragging ? { cursor: 'grabbing' } : undefined}>

      {/* Drag handle — shown only on finishing cards */}
      {onDragHandleDown && (
        <button
          style={{ touchAction: 'none' }}
          onPointerDown={e => {
            e.preventDefault()
            onDragHandleDown(e, order)
          }}
          onClick={e => e.preventDefault()}
          className="absolute left-0 top-0 bottom-0 w-7 flex items-center justify-center
                     text-gray-300 hover:text-[#c9a84c] cursor-grab active:cursor-grabbing
                     z-10 rounded-l-xl hover:bg-gray-50 transition-colors"
          title="Drag to assign to a production line"
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="3"  r="1.5"/>
            <circle cx="9" cy="3"  r="1.5"/>
            <circle cx="3" cy="8"  r="1.5"/>
            <circle cx="9" cy="8"  r="1.5"/>
            <circle cx="3" cy="13" r="1.5"/>
            <circle cx="9" cy="13" r="1.5"/>
          </svg>
        </button>
      )}

      <Link href={`/orders/${order.id}`}
        className={`block rounded-xl border shadow-sm hover:shadow-md hover:border-[#c9a84c]/40 transition-all p-4 group ${cardBorder} ${onDragHandleDown ? 'pl-8' : ''}`}>
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-[#0f1b35]/10 flex items-center justify-center">
                <span className="text-base font-bold text-[#0f1b35]/40 select-none">
                  {order.order_number.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-[#0f1b35] group-hover:text-[#c9a84c] transition-colors truncate">
                {order.order_number}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">{order.customer_name}</p>
              {order.customer_phone && (
                <p className="text-xs text-gray-400">{order.customer_phone}</p>
              )}
            </div>
            <Badge className={STATUS_COLORS[order.status]}>
              {tr[order.status]}
            </Badge>
          </div>
        </div>

        {/* Stage progress mini dots */}
        <div className="flex items-center gap-1 mb-3">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full transition-all ${
                i < stageIndex ? 'bg-green-400' :
                i === stageIndex ? 'bg-[#c9a84c] scale-125' :
                'bg-gray-200'
              }`} />
              {i < STAGES.length - 1 && (
                <div className={`h-px w-3 sm:w-4 ${i < stageIndex ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Piece journey (quantity through the stages) */}
        {journey && (() => {
          const expected = journey[0].qty
          const maxQty = Math.max(...journey.map(s => s.qty), 1)
          const finalQty = journey[5].qty || journey[4].qty || 0
          const missing = expected - finalQty
          const pct = expected > 0 ? (missing / expected) * 100 : 0
          return (
            <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-2">
              <div className="flex items-end justify-between gap-1 h-12">
                {journey.map((s, i) => {
                  const h = s.qty > 0 ? Math.max(Math.round((s.qty / maxQty) * 32), 3) : 2
                  const color =
                    i === 0 ? 'bg-[#0f1b35]'
                    : s.qty === 0 ? 'bg-gray-200'
                    : s.qty < expected ? 'bg-amber-400'
                    : 'bg-green-500'
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5" title={`${s.label}: ${s.qty}`}>
                      <span className="text-[9px] font-semibold text-gray-600 tabular-nums leading-none">{s.qty || ''}</span>
                      <div className={`w-full rounded-sm ${color}`} style={{ height: h + 'px' }} />
                      <span className="text-[8px] text-gray-400 leading-none">{s.label}</span>
                    </div>
                  )
                })}
              </div>
              {finalQty > 0 && missing > 0 && (
                <p className="mt-1 text-[10px] font-semibold text-red-600 text-center">
                  {tr.missing}: {missing} ({pct.toFixed(1)}%)
                </p>
              )}
            </div>
          )
        })()}

        <div className="flex items-center justify-between">
          <Badge className={STAGE_COLORS[order.current_stage]}>
            {stageLabels[order.current_stage]}
          </Badge>
          <span className="text-xs text-gray-400">{formatDate(order.updated_at, lang)}</span>
        </div>
      </Link>
    </div>
  )
}
