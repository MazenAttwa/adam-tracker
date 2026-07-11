'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { BrandName } from '@/components/layout/BrandName'

interface PartyRow { id: string; name: string; remaining: number }

export default function StatementsPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [fetching, setFetching] = useState(true)
  const [vendorRows, setVendorRows] = useState<PartyRow[]>([])
  const [mfrRows, setMfrRows] = useState<PartyRow[]>([])
  const [retailerRows, setRetailerRows] = useState<PartyRow[]>([])

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    fetchAll()
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [
      { data: vendors }, { data: vtx },
      { data: manufacturers }, { data: stageData }, { data: mpays },
      { data: retailers }, { data: rsales }, { data: rpays },
    ] = await Promise.all([
      supabase.from('vendors').select('id, name'),
      supabase.from('vendor_transactions').select('vendor_id, type, amount'),
      supabase.from('manufacturers').select('id, name'),
      supabase.from('stage_data').select('stage, data'),
      supabase.from('manufacturer_payments').select('manufacturer_id, amount'),
      supabase.from('retailers').select('id, name'),
      supabase.from('sales').select('retailer_id, total_amount'),
      supabase.from('retailer_payments').select('retailer_id, amount'),
    ])

    // Vendors (we owe)
    const vRows: PartyRow[] = ((vendors ?? []) as { id: string; name: string }[]).map(v => {
      const txs = ((vtx ?? []) as { vendor_id: string; type: string; amount: number }[]).filter(t => t.vendor_id === v.id)
      const owed = txs.filter(t => t.type === 'purchase').reduce((s, t) => s + (t.amount || 0), 0)
      const paid = txs.filter(t => t.type === 'payment').reduce((s, t) => s + (t.amount || 0), 0)
      return { id: v.id, name: v.name, remaining: owed - paid }
    }).filter(r => Math.abs(r.remaining) > 0.005).sort((a, b) => b.remaining - a.remaining)

    // Manufacturers (we owe) — owed computed from stage costs, matched by name
    const costByName: Record<string, number> = {}
    ;((stageData ?? []) as { stage: string; data: Record<string, unknown> }[]).forEach(r => {
      const d = r.data ?? {}
      const addC = (name: string, amt: number) => {
        const k = (name || '').toLowerCase().trim()
        if (k && amt) costByName[k] = (costByName[k] ?? 0) + amt
      }
      if (r.stage === 'cutting') addC(String(d['manufacturer_name'] ?? ''), Number(d['total_cutting_cost'] ?? 0))
      if (r.stage === 'printing') addC(String(d['manufacturer_name'] ?? ''), Number(d['total_printing_cost'] ?? 0))
      if (r.stage === 'finishing' && Array.isArray(d['manufacturers'])) {
        ;(d['manufacturers'] as { manufacturer_name?: string; subtotal?: number }[]).forEach(m => addC(m.manufacturer_name ?? '', m.subtotal ?? 0))
      }
    })
    const mRows: PartyRow[] = ((manufacturers ?? []) as { id: string; name: string }[]).map(m => {
      const owed = costByName[m.name.toLowerCase().trim()] ?? 0
      const paid = ((mpays ?? []) as { manufacturer_id: string; amount: number }[]).filter(p => p.manufacturer_id === m.id).reduce((s, p) => s + (p.amount || 0), 0)
      return { id: m.id, name: m.name, remaining: owed - paid }
    }).filter(r => Math.abs(r.remaining) > 0.005).sort((a, b) => b.remaining - a.remaining)

    // Retailers (they owe us)
    const rRows: PartyRow[] = ((retailers ?? []) as { id: string; name: string }[]).map(r => {
      const owed = ((rsales ?? []) as { retailer_id: string; total_amount: number }[]).filter(s => s.retailer_id === r.id).reduce((s, x) => s + (x.total_amount || 0), 0)
      const received = ((rpays ?? []) as { retailer_id: string; amount: number }[]).filter(p => p.retailer_id === r.id).reduce((s, p) => s + (p.amount || 0), 0)
      return { id: r.id, name: r.name, remaining: owed - received }
    }).filter(r => Math.abs(r.remaining) > 0.005).sort((a, b) => b.remaining - a.remaining)

    setVendorRows(vRows)
    setMfrRows(mRows)
    setRetailerRows(rRows)
    setFetching(false)
  }

  const fmt = (n: number) => n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const owedToYou = retailerRows.reduce((s, r) => s + Math.max(0, r.remaining), 0)
  const youOwe = vendorRows.reduce((s, r) => s + Math.max(0, r.remaining), 0) + mfrRows.reduce((s, r) => s + Math.max(0, r.remaining), 0)
  const net = owedToYou - youOwe

  function Section({ title, rows, href, positive }: { title: string; rows: PartyRow[]; href: string; positive: boolean }) {
    const total = rows.reduce((s, r) => s + Math.max(0, r.remaining), 0)
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#0f1b35] flex items-center gap-2">
            <span className="w-1 h-5 bg-[#c9a84c] rounded-full" />{title}
          </h2>
          <span className={`text-sm font-bold tabular-nums ${positive ? 'text-green-700' : 'text-red-600'}`}>{fmt(total)}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{tr.noData}</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {rows.map(r => (
              <Link key={r.id} href={href} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-sm text-[#0f1b35]">{r.name}</span>
                <span className={`text-sm font-semibold tabular-nums ${positive ? 'text-green-700' : 'text-red-600'}`}>{fmt(Math.max(0, r.remaining))}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
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
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0f1b35] flex items-center gap-2.5">
            <span className="w-1.5 h-7 bg-[#c9a84c] rounded-full" />{tr.statements}
          </h1>
          <p className="text-gray-500 mt-1"><BrandName /></p>
        </div>

        {/* Net position */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl bg-green-50 border border-green-100 p-5">
            <p className="text-sm text-gray-500">{tr.owedToYou}</p>
            <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">{fmt(owedToYou)}</p>
          </div>
          <div className="rounded-2xl bg-red-50 border border-red-100 p-5">
            <p className="text-sm text-gray-500">{tr.youOwe}</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums mt-1">{fmt(youOwe)}</p>
          </div>
          <div className={`rounded-2xl border p-5 ${net >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
            <p className="text-sm text-gray-500">{tr.netPosition}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${net >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>{fmt(net)}</p>
          </div>
        </div>

        <div className="space-y-5">
          <Section title={tr.retailers + ' — ' + tr.theyOweYou} rows={retailerRows} href="/retailers" positive />
          <Section title={tr.vendors + ' — ' + tr.youOwe} rows={vendorRows} href="/vendors" positive={false} />
          <Section title={tr.manufacturers + ' — ' + tr.youOwe} rows={mfrRows} href="/manufacturers" positive={false} />
        </div>
      </main>
    </div>
  )
}
