'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { BrandName } from '@/components/layout/BrandName'
import { printMaterialsReport } from '@/lib/materialsReportPdf'

interface MatRow {
  id: string
  name: string
  code: string
  unit: string
  vendorName: string
  photoUrl: string
  purchasedQty: number
  purchasedValue: number
  currentQty: number
  currentValue: number
  consumedValue: number
  costPerUnit: number
}

interface VendorRow {
  name: string
  materials: number
  purchasedValue: number
  paid: number
  remaining: number
}

export default function MaterialsReportPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [fetching, setFetching] = useState(true)
  const [rows, setRows] = useState<MatRow[]>([])
  const [vendors, setVendors] = useState<VendorRow[]>([])

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    fetchAll()
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [{ data: mats }, { data: moves }, { data: photos }, { data: vends }, { data: txs }] = await Promise.all([
      supabase.from('materials').select('id, name, code, unit, current_quantity, cost_per_unit, vendor_id'),
      supabase.from('stock_movements').select('material_id, type, quantity, total_cost'),
      supabase.from('material_photos').select('material_id, file_path'),
      supabase.from('vendors').select('id, name'),
      supabase.from('vendor_transactions').select('vendor_id, type, amount'),
    ])

    const photoMap = new Map<string, string>()
    ;((photos ?? []) as { material_id: string; file_path: string }[]).forEach(ph => {
      if (!photoMap.has(ph.material_id) && ph.file_path) {
        photoMap.set(ph.material_id, supabase.storage.from('material-photos').getPublicUrl(ph.file_path).data.publicUrl)
      }
    })

    const vendorName = new Map<string, string>()
    ;((vends ?? []) as { id: string; name: string }[]).forEach(v => vendorName.set(v.id, v.name))

    // Aggregate movements per material
    const purchasedQty: Record<string, number> = {}
    const purchasedValue: Record<string, number> = {}
    ;((moves ?? []) as { material_id: string; type: string; quantity: number; total_cost: number | null }[]).forEach(m => {
      if (m.type === 'in') {
        purchasedQty[m.material_id] = (purchasedQty[m.material_id] ?? 0) + (m.quantity || 0)
      }
    })

    const matRows: MatRow[] = ((mats ?? []) as { id: string; name: string; code: string; unit: string; current_quantity: number; cost_per_unit: number; vendor_id: string | null }[])
      .map(m => {
        const pQty = purchasedQty[m.id] ?? 0
        const cost = m.cost_per_unit || 0
        const pVal = pQty * cost
        const cQty = m.current_quantity || 0
        const cVal = cQty * cost
        return {
          id: m.id,
          name: m.name,
          code: m.code,
          unit: m.unit,
          vendorName: m.vendor_id ? (vendorName.get(m.vendor_id) ?? '-') : '-',
          photoUrl: photoMap.get(m.id) ?? '',
          purchasedQty: pQty,
          purchasedValue: pVal,
          currentQty: cQty,
          currentValue: cVal,
          consumedValue: Math.max(0, pVal - cVal),
          costPerUnit: cost,
        }
      })
      .sort((a, b) => b.purchasedValue - a.purchasedValue)
    setRows(matRows)

    // Per-vendor rollup: purchased value (from materials linked to that vendor) + paid/remaining (from tx)
    const paidByVendor: Record<string, number> = {}
    const owedByVendor: Record<string, number> = {}
    ;((txs ?? []) as { vendor_id: string; type: string; amount: number }[]).forEach(t => {
      if (t.type === 'payment') paidByVendor[t.vendor_id] = (paidByVendor[t.vendor_id] ?? 0) + (t.amount || 0)
      else owedByVendor[t.vendor_id] = (owedByVendor[t.vendor_id] ?? 0) + (t.amount || 0)
    })

    const vendorAgg: Record<string, { name: string; materials: number; purchasedValue: number }> = {}
    matRows.forEach(r => {
      if (r.vendorName === '-') return
      const key = r.vendorName
      vendorAgg[key] = vendorAgg[key] ?? { name: key, materials: 0, purchasedValue: 0 }
      vendorAgg[key].materials += 1
      vendorAgg[key].purchasedValue += r.purchasedValue
    })

    const vendorRows: VendorRow[] = ((vends ?? []) as { id: string; name: string }[])
      .map(v => {
        const agg = vendorAgg[v.name]
        const owed = owedByVendor[v.id] ?? 0
        const paid = paidByVendor[v.id] ?? 0
        return {
          name: v.name,
          materials: agg?.materials ?? 0,
          purchasedValue: agg?.purchasedValue ?? owed,
          paid,
          remaining: Math.max(0, owed - paid),
        }
      })
      .filter(v => v.purchasedValue > 0 || v.paid > 0 || v.remaining > 0)
      .sort((a, b) => b.purchasedValue - a.purchasedValue)
    setVendors(vendorRows)

    setFetching(false)
  }

  const totalPurchased = rows.reduce((s, r) => s + r.purchasedValue, 0)
  const totalStockValue = rows.reduce((s, r) => s + r.currentValue, 0)
  const totalConsumed = rows.reduce((s, r) => s + r.consumedValue, 0)
  const totalRemainingOwed = vendors.reduce((s, v) => s + v.remaining, 0)
  const totalPaid = vendors.reduce((s, v) => s + v.paid, 0)

  const fmt = (n: number) => n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const nf = (n: number) => n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')

  function downloadPdf() {
    printMaterialsReport({
      brandName: 'Adam Store',
      title: tr.materialsReport,
      generatedLabel: tr.generated ?? 'Generated',
      totalPurchased, totalStockValue, totalConsumed, totalPaid, totalRemainingOwed,
      labels: {
        totalPurchased: tr.totalPurchasedValue, stockValue: tr.currentStockValue, consumed: tr.consumedValue,
        paid: tr.totalPaid, remaining: tr.remaining,
        material: tr.materialName, vendor: tr.vendor, purchasedQty: tr.purchasedQty, costPerUnit: tr.costPerUnit,
        purchasedValue: tr.purchasedValue, currentQty: tr.currentQty, currentValue: tr.currentStockValue,
        materialsHeading: tr.materialsBreakdown, vendorsHeading: tr.purchasesByVendor,
        materials: tr.materials,
      },
      materials: rows.map(r => ({
        name: r.name, vendor: r.vendorName, unit: r.unit, photoUrl: r.photoUrl,
        purchasedQty: r.purchasedQty, costPerUnit: r.costPerUnit, purchasedValue: r.purchasedValue,
        currentQty: r.currentQty, currentValue: r.currentValue,
      })),
      vendors: vendors.map(v => ({
        name: v.name, materials: v.materials, purchasedValue: v.purchasedValue, paid: v.paid, remaining: v.remaining,
      })),
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
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-[#0f1b35] flex items-center gap-2.5">
              <span className="w-1.5 h-7 bg-[#c9a84c] rounded-full" />{tr.materialsReport}
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
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.totalPurchasedValue}</p>
            <p className="text-2xl font-bold text-[#0f1b35] tabular-nums mt-1">{fmt(totalPurchased)}</p>
          </div>
          <div className="rounded-2xl bg-green-50 border border-green-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.currentStockValue}</p>
            <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">{fmt(totalStockValue)}</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.consumedValue}</p>
            <p className="text-2xl font-bold text-[#0f1b35] tabular-nums mt-1">{fmt(totalConsumed)}</p>
          </div>
          <div className="rounded-2xl bg-green-50 border border-green-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.totalPaid}</p>
            <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">{fmt(totalPaid)}</p>
          </div>
          <div className="rounded-2xl bg-red-50 border border-red-100 p-5 shadow-sm">
            <p className="text-sm text-gray-500">{tr.remaining}</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums mt-1">{fmt(totalRemainingOwed)}</p>
          </div>
        </div>

        {/* Purchases by vendor */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-[#0f1b35] flex items-center gap-2">
              <span className="w-1 h-5 bg-[#c9a84c] rounded-full" />{tr.purchasesByVendor}
            </h2>
          </div>
          {vendors.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{tr.noData}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.vendor}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.materials}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.purchasedValue}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.totalPaid}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.remaining}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map(v => (
                    <tr key={v.name} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3 font-medium text-[#0f1b35]">{v.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">{v.materials}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-[#0f1b35]">{fmt(v.purchasedValue)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-green-700">{v.paid > 0 ? fmt(v.paid) : '—'}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-red-600">{v.remaining > 0.005 ? fmt(v.remaining) : '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-5 py-3 text-[#0f1b35]">{tr.total}</td>
                    <td className="px-5 py-3"></td>
                    <td className="px-5 py-3 text-right tabular-nums text-[#0f1b35]">{fmt(vendors.reduce((s, v) => s + v.purchasedValue, 0))}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-green-700">{fmt(totalPaid)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-red-600">{fmt(totalRemainingOwed)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Materials breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-[#0f1b35] flex items-center gap-2">
              <span className="w-1 h-5 bg-[#c9a84c] rounded-full" />{tr.materialsBreakdown}
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
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{tr.materialName}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{tr.vendor}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{tr.purchasedQty}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{tr.costPerUnit}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{tr.purchasedValue}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{tr.currentQty}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">{tr.currentStockValue}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2">
                        {r.photoUrl
                          ? <img src={r.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-100" />
                          : <div className="w-12 h-12 rounded-lg bg-gray-100" />}
                      </td>
                      <td className="px-4 py-2 font-medium text-[#0f1b35]">{r.name}</td>
                      <td className="px-4 py-2 text-gray-600">{r.vendorName}</td>
                      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{nf(r.purchasedQty)} {r.unit}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-600">{fmt(r.costPerUnit)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#0f1b35]">{fmt(r.purchasedValue)}</td>
                      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{nf(r.currentQty)} {r.unit}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-green-700">{fmt(r.currentValue)}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td className="px-3 py-3"></td>
                    <td className="px-4 py-3 text-[#0f1b35]" colSpan={4}>{tr.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#0f1b35]">{fmt(totalPurchased)}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700">{fmt(totalStockValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
