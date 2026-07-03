'use client'
import { useLang } from '@/contexts/LanguageContext'
import type { StageData } from '@/lib/types'

export function PieceJourney({ stageDataMap }: { stageDataMap: Record<string, StageData> }) {
  const { tr } = useLang()
  const num = (stage: string, key: string) => {
    const v = (stageDataMap[stage]?.data as Record<string, unknown> | undefined)?.[key]
    return typeof v === 'number' ? v : 0
  }
  const finishingQty = (() => {
    const arr = (stageDataMap['finishing']?.data as Record<string, unknown> | undefined)?.['manufacturers']
    if (Array.isArray(arr)) return (arr as { quantity?: number }[]).reduce((s, m) => s + (m.quantity ?? 0), 0)
    return 0
  })()

  const steps = [
    { label: tr.draft, qty: num('draft', 'quantity') },
    { label: tr.cutting, qty: num('cutting', 'quantity_to_cut') },
    { label: tr.printing, qty: num('printing', 'quantity_to_print') },
    { label: tr.finishing, qty: finishingQty },
    { label: tr.submitted, qty: num('submitted', 'quantity_submitted') },
    { label: tr.received, qty: num('received', 'quantity_received') },
  ]
  const expected = steps[0].qty
  const maxQty = Math.max(...steps.map(s => s.qty), 1)
  const finalQty = steps[5].qty || steps[4].qty || 0
  const missing = expected > 0 ? expected - finalQty : 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h2 className="font-semibold text-[#0f1b35]">{tr.pieceJourney}</h2>
        {expected > 0 && finalQty > 0 && (
          <span className={`text-sm font-semibold px-3 py-1 rounded-full ${missing > 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
            {missing > 0 ? tr.missing + ': ' + missing + ' (' + ((missing / expected) * 100).toFixed(1) + '%)' : tr.expected + ' = ' + finalQty + ' ✓'}
          </span>
        )}
      </div>
      <div className="flex items-stretch gap-3 h-56">
        {steps.map((s, i) => {
          const h = (s.qty / maxQty) * 100
          const diff = expected > 0 ? s.qty - expected : 0
          const color = i === 0 ? 'bg-[#0f1b35]' : s.qty === 0 ? 'bg-gray-200' : s.qty < expected ? 'bg-amber-400' : 'bg-green-500'
          return (
            <div key={i} className="flex-1 flex flex-col items-center">
              <div className="flex-1 flex flex-col justify-end items-center w-full">
                <span className="text-sm font-bold text-[#0f1b35] tabular-nums mb-1">{s.qty}</span>
                <div className={`w-8 rounded-t-lg ${color}`} style={{ height: (s.qty > 0 ? Math.max(h, 4) : 2) + '%' }} />
              </div>
              <span className="text-xs text-gray-500 text-center mt-2">{s.label}</span>
              {i > 0 && s.qty > 0 && diff !== 0 && (
                <span className={`text-xs font-semibold mt-0.5 ${diff < 0 ? 'text-red-500' : 'text-green-600'}`}>{diff > 0 ? '+' : ''}{diff}</span>
              )}
            </div>
          )
        })}
      </div>
      {expected > 0 && (
        <p className="text-xs text-gray-400 mt-4">{tr.expected}: {expected} · {tr.received}: {steps[5].qty || '-'}</p>
      )}
    </div>
  )
}