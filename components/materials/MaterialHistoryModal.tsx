'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLang } from '@/contexts/LanguageContext'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import type { Material, StockMovement } from '@/lib/types'

export function MaterialHistoryModal({
  material,
  onClose,
}: {
  material: Material | null
  onClose: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const { tr, lang } = useLang()
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [savingDate, setSavingDate] = useState(false)

  useEffect(() => {
    if (!material) return
    let active = true
    setLoading(true)
    ;(async () => {
      const { data } = await supabase
        .from('stock_movements')
        .select('*, orders(order_number), vendors(name)')
        .eq('material_id', material.id)
        .order('created_at', { ascending: false })
      if (active) {
        setMovements((data as StockMovement[]) ?? [])
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [material, supabase])

  function receiptUrl(path: string): string {
    return supabase.storage.from('material-photos').getPublicUrl(path).data.publicUrl
  }

  async function savePurchaseDate(id: string) {
    if (!editDate) { setEditingId(null); return }
    setSavingDate(true)
    await supabase.from('stock_movements').update({ purchase_date: editDate }).eq('id', id)
    setMovements(prev => prev.map(m => m.id === id ? { ...m, purchase_date: editDate } : m))
    setSavingDate(false)
    setEditingId(null)
  }

  const purchases = movements.filter(m => m.type === 'in')
  const usage = movements.filter(m => m.type === 'out')
  const totalIn = purchases.reduce((s, m) => s + m.quantity, 0)
  const totalOut = usage.reduce((s, m) => s + m.quantity, 0)
  const net = totalIn - totalOut
  const fmt = (n: number) => n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')

  return (
    <Modal open={!!material} onClose={onClose} title={`${tr.history}: ${material?.name ?? ''}`}>
      {loading ? (
        <p className="text-sm text-gray-500 py-6 text-center">…</p>
      ) : (
        <div className="space-y-6">
          {/* Totals */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
              <div className="text-xs text-gray-600">{tr.totalPurchased}</div>
              <div className="font-bold text-green-700 tabular-nums">{fmt(totalIn)}</div>
            </div>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
              <div className="text-xs text-gray-600">{tr.totalUsed}</div>
              <div className="font-bold text-red-600 tabular-nums">{fmt(totalOut)}</div>
            </div>
            <div className="rounded-lg bg-[#0f1b35] p-3 text-center">
              <div className="text-xs text-gray-300">{tr.currentStock}</div>
              <div className="font-bold text-white tabular-nums">{fmt(net)}</div>
            </div>
          </div>

          {/* Purchases */}
          <div>
            <h3 className="font-semibold text-[#0f1b35] mb-2 text-sm">{tr.purchaseHistory}</h3>
            {purchases.length === 0 ? (
              <p className="text-sm text-gray-400">{tr.noPurchases}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">{tr.date}</th>
                      <th className="text-right px-3 py-2 font-medium">{tr.quantity}</th>
                      <th className="text-left px-3 py-2 font-medium">{tr.vendorLabel}</th>
                      <th className="text-right px-3 py-2 font-medium">{tr.costLabel}</th>
                      <th className="text-left px-3 py-2 font-medium">{tr.receiptLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {purchases.map(p => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 text-gray-600">
                          {editingId === p.id ? (
                            <input
                              type="date"
                              autoFocus
                              defaultValue={(p.purchase_date ?? p.created_at ?? '').slice(0, 10)}
                              onChange={e => setEditDate(e.target.value)}
                              onBlur={() => savePurchaseDate(p.id)}
                              disabled={savingDate}
                              className="px-2 py-1 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f1b35]"
                            />
                          ) : (
                            <button
                              onClick={() => { setEditDate((p.purchase_date ?? p.created_at ?? '').slice(0, 10)); setEditingId(p.id) }}
                              className="inline-flex items-center gap-1 hover:text-[#0f1b35] hover:underline"
                              title={tr.editDate}
                            >
                              {formatDate(p.purchase_date ?? p.created_at, lang)}
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-green-700 font-medium">
                          +{fmt(p.quantity)}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{p.vendors?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                          {p.total_cost != null ? fmt(p.total_cost) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {p.receipt_path ? (
                            <a
                              href={receiptUrl(p.receipt_path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {tr.viewReceipt}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Usage */}
          <div>
            <h3 className="font-semibold text-[#0f1b35] mb-2 text-sm">{tr.usageHistory}</h3>
            {usage.length === 0 ? (
              <p className="text-sm text-gray-400">{tr.noUsage}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">{tr.date}</th>
                      <th className="text-right px-3 py-2 font-medium">{tr.quantity}</th>
                      <th className="text-left px-3 py-2 font-medium">{tr.orderLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {usage.map(u => (
                      <tr key={u.id}>
                        <td className="px-3 py-2 text-gray-600">{formatDate(u.created_at, lang)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-600 font-medium">
                          −{fmt(u.quantity)}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {u.orders?.order_number ?? u.notes ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
