'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { BrandName } from '@/components/layout/BrandName'
import { printMissingReport } from '@/lib/missingReportPdf'

interface OrderRow {
  orderNumber: string
  product: string
  expected: number
  received: number
  missing: number
  lossPct: number
  photoUrl: string
  stages: { label: string; qty: number }[]
}

export default function MissingItemsPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [fetching, setFetching] = useState(true)
  const [rows, setRows] = useState<OrderRow[]>([])
  const [byStage, setByStage] = useState<{ stage: string; lost: number }[]>([])
  const [byMfr, setByMfr] = useState<{ name: string; handled: number; lost: number; lossPct: number }[]>([])

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    fetchAll()
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [{ data: orders }, { data: sd }, { data: photos }] = await Promise.all([
      supabase.from('orders').select('id, order_number, customer_name'),
      supabase.from('stage_data').select('order_id, stage, data'),
      supabase.from('order_photos').select('order_id, file_path'),
    ])

    const photoMap = new Map<string, string>()
    ;((photos ?? []) as { order_id: string; file_path: string }[]).forEach(ph => {
      if (!photoMap.has(ph.order_id) && ph.file_path) {
        photoMap.set(ph.order_id, supabase.storage.from('product-photos').getPublicUrl(ph.file_path).data.publicUrl)
      }
    })

    const byOrder: Record<string, Record<string, Record<string, unknown>>> = {}
    ;((sd ?? []) as { order_id: string; stage: string; data: Record<string, unknown> }[]).forEach(r => {
      ;(byOrder[r.order_id] = byOrder[r.order_id] ?? {})[r.stage] = r.data ?? {}
    })

    const num = (m: Record<string, Record<string, unknown>>, stage: string, key: string) => {
      const v = m[stage]?.[key]
      return typeof v === 'number' ? v : 0
    }
    const finishingQty = (m: Record<string, Record<string, unknown>>) => {
      const arr = m['finishing']?.['manufacturers']
      return Array.isArray(arr) ? (arr as { quantity?: number }[]).reduce((s, x) => s + (x.quantity ?? 0), 0) : 0
    }

    const orderRows: OrderRow[] = []
    const stageLost: Record<string, number> = { cutting: 0, printing: 0, finishing: 0, submitted: 0, received: 0 }
    const mfr: Record<string, { handled: number; lost: number }> = {}

    ;((orders ?? []) as { id: string; order_number: string; customer_name: string }[]).forEach(o => {
      const m = byOrder[o.id] ?? {}
      const expected = num(m, 'draft', 'quantity')
      if (expected <= 0) return

      const cutting = num(m, 'cutting', 'quantity_to_cut')
      const printing = num(m, 'printing', 'quantity_to_print')
      const finishing = finishingQty(m)
      const submitted = num(m, 'submitted', 'quantity_submitted')
      const received = num(m, 'received', 'quantity_received')
      const finalQty = received || submitted || finishing || 0
      const missing = expected - finalQty

      if (finalQty > 0 && missing > 0) {
        orderRows.push({
          orderNumber: o.order_number,
          product: o.customer_name || '-',
          expected,
          received: finalQty,
          missing,
          lossPct: (missing / expected) * 100,
          photoUrl: photoMap.get(o.id) ?? '',
          stages: [
            { label: 'D', qty: expected },
            { label: 'C', qty: cutting },
            { label: 'P', qty: printing },
            { label: 'F', qty: finishing },
            { label: 'S', qty: submitted },
            { label: 'R', qty: received },
          ],
        })

        // Where was it lost? attribute the drop at each transition to that stage.
        const seq: [string, number][] = [
          ['cutting', cutting], ['printing', printing], ['finishing', finishing],
          ['submitted', submitted], ['received', received],
        ]
        let prev = expected
        for (const [stage, q] of seq) {
          if (q > 0) {
            const drop = prev - q
            if (drop > 0) stageLost[stage] = (stageLost[stage] ?? 0) + drop
            prev = q
          }
        }
      }

      // Manufacturer attribution (finishing stage handles the pieces)
      const arr = m['finishing']?.['manufacturers']
      if (Array.isArray(arr)) {
        ;(arr as { manufacturer_name?: string; quantity?: number }[]).forEach(x => {
          const name = (x.manufacturer_name ?? '').trim()
          if (!name) return
          const handled = x.quantity ?? 0
          mfr[name] = mfr[name] ?? { handled: 0, lost: 0 }
          mfr[name].handled += handled
        })
      }
    })

    // Manufacturer loss: share the order's finishing->received drop across its manufacturers by handled qty
    ;((orders ?? []) as { id: string }[]).forEach(o => {
      const m = byOrder[o.id] ?? {}
      const finishing = finishingQty(m)
      const received = num(m, 'received', 'quantity_received') || num(m, 'submitted', 'quantity_submitted')
      const drop = finishing - received
      const arr = m['finishing']?.['manufacturers']
      if (drop > 0 && finishing > 0 && Array.isArray(arr)) {
        ;(arr as { manufacturer_name?: string; quantity?: number }[]).forEach(x => {
          const name = (x.manufacturer_name ?? '').trim()
          if (!name || !mfr[name]) return
          mfr[name].lost += drop * ((x.quantity ?? 0) / finishing)
        })
      }
    })

    orderRows.sort((a, b) => b.lossPct - a.lossPct)
    setRows(orderRows)
    setByStage(Object.entries(stageLost).filter(([, v]) => v > 0).map(([stage, lost]) => ({ stage, lost: Math.round(lost) })).sort((a, b) => b.lost - a.lost))
    setByMfr(
      Object.entries(mfr)
        .map(([name, v]) => ({ name, handled: Math.round(v.handled), lost: Math.round(v.lost), lossPct: v.handled > 0 ? (v.lost / v.handled) * 100 : 0 }))
        .filter(x => x.lost > 0)
        .sort((a, b) => b.lossPct - a.lossPct)
    )
    setFetching(false)
  }

  const totalExpected = rows.reduce((s, r) => s + r.expected, 0)
  const totalReceived = rows.reduce((s, r) => s + r.received, 0)
  const totalMissing = rows.reduce((s, r) => s + r.missing, 0)
  const overallPct = totalExpected > 0 ? (totalMissing / totalExpected) * 100 : 0
  const nf = (n: number) => n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')

  function downloadPdf() {
    printMissingReport({
      brandName: 'Adam Store',
      title: tr.missingItemsReport,
      generatedLabel: tr.generated ?? 'Generated',
      totalExpected, totalReceived, totalMissing, overallPct,
      expectedLabel: tr.expected, receivedLabel: tr.received, missingLabel: tr.missing, lossPctLabel: tr.lossPct,
      orders: rows.map(r => ({ ...r, photoUrl: r.photoUrl, stages: r.stages })),
      ordersHeading: tr.ordersWithLoss, orderLabel: tr.orders, productLabel: tr.customer,
      byStage, byStageHeading: tr.lossByStage, stageLabel: tr.stage, lostLabel: tr.missing,
      byManufacturer: byMfr, byManufacturerHeading: tr.lossByManufacturer,
      manufacturerLabel: tr.manufacturers, handledLabel: tr.quantity,
    })
  }

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-[#f5f5f0]">
        <Navbar />
        <div className="flex items-center justify-center py-32 text-gray-400">{tr.loading}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#0f1b35] flex items-center gap-2.5">
              <span className="w-1.5 h-7 bg-[#c9a84c] rounded-full" />{tr.missingItemsReport}
            </h1>
            <p className="text-gray-500 mt-1"><BrandName /></p>
          </div>
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 rounded-lg bg-[#0f1b35] text-white hover:bg-[#0f1b35]/90 transition-colors px-4 py-2 text-sm font-medium"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
            {tr.printPdf}
          </button>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.expected}</p>
            <p className="text-2xl font-bold text-[#0f1b35] tabular-nums mt-1">{nf(totalExpected)}</p>
          </div>
          <div className="rounded-2xl bg-green-50 border border-green-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.received}</p>
            <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">{nf(totalReceived)}</p>
          </div>
          <div className="rounded-2xl bg-red-50 border border-red-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.missing}</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums mt-1">{nf(totalMissing)}</p>
          </div>
          <div className="rounded-2xl bg-red-50 border border-red-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.lossPct}</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums mt-1">{overallPct.toFixed(1)}%</p>
          </div>
        </div>

        {/* Orders with loss */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-[#0f1b35] flex items-center gap-2">
              <span className="w-1 h-5 bg-[#c9a84c] rounded-full" />{tr.ordersWithLoss}
            </h2>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{tr.noData}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-3"></th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.orders}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.customer}</th>
                    <th className="text-center px-5 py-3 font-medium text-gray-600">{tr.pieceJourney}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.expected}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.received}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.missing}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.lossPct}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.orderNumber} className={`border-b border-gray-50 last:border-0 ${r.lossPct >= 15 ? 'bg-red-50/60' : r.lossPct >= 5 ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-3 py-2">
                        {r.photoUrl
                          ? <img src={r.photoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-100" />
                          : <div className="w-10 h-10 rounded-lg bg-gray-100" />}
                      </td>
                      <td className="px-5 py-3 font-medium text-[#0f1b35]">{r.orderNumber}</td>
                      <td className="px-5 py-3 text-gray-600">{r.product}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const mx = Math.max(...r.stages.map(s => s.qty), 1)
                          return (
                            <div className="flex items-end justify-center gap-0.5 h-9 min-w-[110px]">
                              {r.stages.map((s, i) => {
                                const h = s.qty > 0 ? Math.max(Math.round((s.qty / mx) * 30), 2) : 2
                                const color = i === 0 ? 'bg-[#0f1b35]' : s.qty === 0 ? 'bg-gray-200' : s.qty < r.expected ? 'bg-amber-400' : 'bg-green-500'
                                return (
                                  <div key={i} className="flex flex-col items-center gap-0.5" title={`${s.label}: ${s.qty}`}>
                                    <div className={`w-2.5 rounded-sm ${color}`} style={{ height: h + 'px' }} />
                                    <span className="text-[7px] text-gray-400 leading-none">{s.label}</span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{nf(r.expected)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-green-700">{nf(r.received)}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-red-600">{nf(r.missing)}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-bold text-red-600">{r.lossPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* By stage + by manufacturer */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-[#0f1b35] flex items-center gap-2">
                <span className="w-1 h-5 bg-[#c9a84c] rounded-full" />{tr.lossByStage}
              </h2>
            </div>
            {byStage.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">{tr.noData}</p> : (
              <div className="divide-y divide-gray-50">
                {byStage.map(s => (
                  <div key={s.stage} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-[#0f1b35] capitalize">{s.stage}</span>
                    <span className="text-sm font-semibold tabular-nums text-red-600">{nf(s.lost)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-[#0f1b35] flex items-center gap-2">
                <span className="w-1 h-5 bg-[#c9a84c] rounded-full" />{tr.lossByManufacturer}
              </h2>
            </div>
            {byMfr.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">{tr.noData}</p> : (
              <div className="divide-y divide-gray-50">
                {byMfr.map(m => (
                  <div key={m.name} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-[#0f1b35]">{m.name}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      <span className="text-red-600">{nf(m.lost)}</span>
                      <span className="text-gray-400 text-xs ml-2">({m.lossPct.toFixed(1)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
