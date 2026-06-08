'use client'
import Link from 'next/link'
import { useLang } from '@/contexts/LanguageContext'
import { Badge } from '@/components/ui/Badge'
import { STAGE_COLORS, STATUS_COLORS, STAGE_ORDER } from '@/lib/stageConfig'
import { STAGES } from '@/lib/stageConfig'
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
    cutting_printing: tr.cutting_printing,
    finishing: tr.finishing,
    submitted: tr.submitted,
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
          {/* 6-dot grip icon */}
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
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-semibold text-[#0f1b35] group-hover:text-[#c9a84c] transition-colors">
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

        {/* Stage progress mini */}
        <div className="flex items-center gap-1 mb-3">
          {STAGES.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full transition-all ${
                i < stageIndex ? 'bg-green-400' :
                i === stageIndex ? 'bg-[#c9a84c] scale-125' :
                'bg-gray-200'
              }`} />
              {i < STAGES.length - 1 && (
                <div className={`h-px w-4 sm:w-6 ${i < stageIndex ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

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
