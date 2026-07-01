'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'

interface LogisticsRow {
  kind: 'order' | 'material'
  ref: string
  date: string
  amount: number
}

export default function LogisticsPage() {
  const { profile, loading } = useAuth()
  const { tr } = useLang()
  const router = useRouter()
  const supabase = createClient()
  const [rows, setRows] = useState<LogisticsRow[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile])

  async function fetchData() {
    const [{ data: sd }, { data: sm }, { data: ords }, { data: mats }] = await Promise.all([
      supabase.from('stage_data').select('order_id, data, updated_at'),
      supabase.from('stock_movements').select('material_id, logistic_cost, purchase_date, created_at'),
      supabase.from('orders').select('id, order_number'),
      supabase.from('materials').select('id, name'),
    ])
    const orderNum: Record<string, string> = {}
    ;((ords ?? []) as { id: string; order_number: string }[]).forEach(o => { orderNum[o.id] = o.order_number })
    const byOrder: Record<string, number> = {}
    const byOrderDate: Record<string, string> = {}
    ;((sd ?? []) as { order_id: string; data: Record<string, unknown> | null; updated_at: string | null }[]).forEach(r => {
      const v = r.data?.['logistic_cost']
      if (typeof v === 'number' && v > 0) {
        byOrder[r.order_id] = (byOrder[r.order_id] ?? 0) + v
        const d = r.updated_at ? r.updated_at.slice(0, 10) : ''
        if (d && (!byOrderDate[r.order_id] || d > byOrderDate[r.order_id])) byOrderDate[r.order_id] = d
      }
    })
    const orderRows: LogisticsRow[] = Object.entries(byOrder).map(([oid, amt]) => ({
      kind: 'order' as const, ref: orderNum[oid] ?? oid, date: byOrderDate[oid] ?? '', amount: amt,
    }))
    const matName: Record<string, string> = {}
    ;((mats ?? []) as { id: string; name: string }[]).forEach(m => { matName[m.id] = m.name })
    const matRows: LogisticsRow[] = ((sm ?? []) as { material_id: string; logistic_cost: number | null; purchase_date: string | null; created_at: string }[])
      .filter(m => (m.logistic_cost ?? 0) > 0)
      .map(m => ({ kind: 'material' as const, ref: matName[m.material_id] ?? m.material_id, date: m.purchase_date ?? (m.created_at ? m.created_at.slice(0, 10) : ''), amount: m.logistic_cost ?? 0 }))
    setRows([...orderRows, ...matRows].sort((a, b) => b.amount - a.amount))
    setFetching(false)
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

  const orderTotal = rows.filter(r => r.kind === 'order').reduce((s, r) => s + r.amount, 0)
  const matTotal = rows.filter(r => r.kind === 'material').reduce((s, r) => s + r.amount, 0)
  const total = orderTotal + matTotal
  const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#0f1b35] mb-1">{tr.logisticsReport}</h1>
        <p className="text-gray-500 mb-6">{tr.appName}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
            <p className="text-sm text-gray-500">{tr.orderLogistics}</p>
            <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">EGP {money(orderTotal)}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
            <p className="text-sm text-gray-500">{tr.materialLogistics}</p>
            <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">EGP {money(matTotal)}</p>
          </div>
          <div className="bg-[#0f1b35] rounded-xl p-5">
            <p className="text-sm text-gray-300">{tr.totalLogistics}</p>
            <p className="text-2xl font-bold text-white tabular-nums mt-1">EGP {money(total)}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-5 py-3 font-medium text-gray-600">{tr.source}</th>
                  <th className="px-5 py-3 font-medium text-gray-600">{tr.date}</th>
                  <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.amount}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-5 py-3 font-medium text-[#0f1b35]">{r.ref} <span className="text-xs text-gray-400">({r.kind === 'order' ? tr.orderLogistics : tr.materialLogistics})</span></td>
                    <td className="px-5 py-3 text-gray-500">{r.date || '-'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-amber-700">{money(r.amount)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-400">-</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 font-bold">
                  <td className="px-5 py-3" colSpan={2}>{tr.totalLogistics}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-amber-700">EGP {money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}