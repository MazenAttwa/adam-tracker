'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import type { MonthClose, Retailer, Sale, Material, Order, Stage } from '@/lib/types'

interface MonthPL {
  yearMonth: string
  revenue: number
  expenses: number
  net: number
  isClosed: boolean
}

interface MaterialUsage {
  materialId: string
  name: string
  code: string
  unit: string
  totalIn: number
  totalOut: number
  net: number
}

type ReportTab = 'pnl' | 'orders' | 'materials' | 'retailers'

const STAGES: Stage[] = ['draft', 'preparation', 'cutting', 'printing', 'finishing', 'submitted']

export default function ReportsPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<ReportTab>('pnl')
  const [fetching, setFetching] = useState(true)

  // P&L data
  const [monthPL, setMonthPL] = useState<MonthPL[]>([])

  // Orders data
  const [orders, setOrders] = useState<Order[]>([])
  const [orderDateFrom, setOrderDateFrom] = useState('')
  const [orderDateTo, setOrderDateTo] = useState('')

  // Materials data
  const [materialUsage, setMaterialUsage] = useState<MaterialUsage[]>([])

  // Retailer statements
  const [retailers, setRetailers] = useState<Retailer[]>([])
  const [selectedRetailerId, setSelectedRetailerId] = useState('')
  const [retailerSales, setRetailerSales] = useState<Sale[]>([])

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    fetchAll().finally(() => setFetching(false))
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    await Promise.all([fetchPLData(), fetchOrdersData(), fetchMaterialsData(), fetchRetailersData()])
  }

  async function fetchPLData() {
    const [{ data: revData }, { data: expData }, { data: closesData }] = await Promise.all([
      supabase.from('revenue').select('date, amount').order('date'),
      supabase.from('expenses').select('date, amount').order('date'),
      supabase.from('month_closes').select('*').order('year_month', { ascending: false }),
    ])

    const revenues = (revData ?? []) as { date: string; amount: number }[]
    const expenses = (expData ?? []) as { date: string; amount: number }[]
    const closes = (closesData ?? []) as MonthClose[]

    const monthSet = new Set<string>()
    revenues.forEach(r => monthSet.add(r.date.substring(0, 7)))
    expenses.forEach(e => monthSet.add(e.date.substring(0, 7)))
    closes.forEach(c => monthSet.add(c.year_month))

    const closedMap = new Map(closes.map(c => [c.year_month, c]))

    const pl = Array.from(monthSet).sort().reverse().map(ym => {
      const rev = revenues.filter(r => r.date.startsWith(ym)).reduce((s, r) => s + r.amount, 0)
      const exp = expenses.filter(e => e.date.startsWith(ym)).reduce((s, e) => s + e.amount, 0)
      const closed = closedMap.get(ym)
      return {
        yearMonth: ym,
        revenue: closed?.total_revenue ?? rev,
        expenses: closed?.total_expenses ?? exp,
        net: closed?.net_profit ?? (rev - exp),
        isClosed: !!closed,
      }
    })

    setMonthPL(pl)
  }

  async function fetchOrdersData() {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500)
    setOrders((data ?? []) as Order[])
  }

  async function fetchMaterialsData() {
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('material_id, type, quantity, materials(id, name, code, unit)')
      .limit(1000)

    const map = new Map<string, MaterialUsage>()
    for (const mv of (movements ?? [])) {
      const m = mv as unknown as { material_id: string; type: string; quantity: number; materials: { id: string; name: string; code: string; unit: string } | null }
      if (!m.materials) continue
      if (!map.has(m.material_id)) {
        map.set(m.material_id, {
          materialId: m.material_id,
          name: m.materials.name,
          code: m.materials.code,
          unit: m.materials.unit,
          totalIn: 0,
          totalOut: 0,
          net: 0,
        })
      }
      const entry = map.get(m.material_id)!
      if (m.type === 'in') entry.totalIn += m.quantity
      else entry.totalOut += m.quantity
      entry.net = entry.totalIn - entry.totalOut
    }

    setMaterialUsage(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function fetchRetailersData() {
    const { data } = await supabase.from('retailers').select('*').order('name')
    setRetailers((data ?? []) as Retailer[])
  }

  async function loadRetailerSales(retailerId: string) {
    setSelectedRetailerId(retailerId)
    if (!retailerId) { setRetailerSales([]); return }
    const { data } = await supabase
      .from('sales')
      .select('*')
      .eq('retailer_id', retailerId)
      .order('date', { ascending: false })
    setRetailerSales((data ?? []) as Sale[])
  }

  // Filtered orders
  const filteredOrders = orders.filter(o => {
    const d = o.created_at.split('T')[0]
    if (orderDateFrom && d < orderDateFrom) return false
    if (orderDateTo && d > orderDateTo) return false
    return true
  })

  const ordersByStage = STAGES.reduce((acc, s) => {
    acc[s] = filteredOrders.filter(o => o.current_stage === s).length
    return acc
  }, {} as Record<Stage, number>)

  const stageLabels: Record<Stage, string> = {
    draft: tr.draft,
    preparation: tr.preparation,
    cutting: tr.cutting,
    printing: tr.printing,
    finishing: tr.finishing,
    submitted: tr.submitted, received: tr.received,
  }

  const selectedRetailer = retailers.find(r => r.id === selectedRetailerId)

  function printPL() {
    const rows = monthPL.map(m => `
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:8px 12px">${m.yearMonth}${m.isClosed ? ' ✓' : ''}</td>
        <td style="padding:8px 12px;text-align:right;color:#16a34a">${m.revenue.toFixed(2)}</td>
        <td style="padding:8px 12px;text-align:right;color:#dc2626">${m.expenses.toFixed(2)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:${m.net >= 0 ? '#16a34a' : '#dc2626'}">${m.net.toFixed(2)}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>P&L Report - Adam Store</title>
<style>body{font-family:Arial,sans-serif;padding:40px;color:#1a1a2e}h1{color:#0f1b35;margin-bottom:8px}h2{color:#888;font-size:14px;margin-bottom:24px;font-weight:normal}table{width:100%;border-collapse:collapse}thead{background:#f5f5f0}th{padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#555}th:not(:first-child){text-align:right}</style>
</head><body>
<h1>Adam Store — Profit & Loss Report</h1>
<h2>Generated ${new Date().toLocaleDateString()}</h2>
<table><thead><tr><th>Month</th><th style="text-align:right">Revenue</th><th style="text-align:right">Expenses</th><th style="text-align:right">Net Profit</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>window.print()</script></body></html>`
    const w = window.open('', '_blank', 'width=820,height=650')
    w?.document.write(html); w?.document.close()
  }

  function printRetailerStatement() {
    if (!selectedRetailer || retailerSales.length === 0) return
    const rows = retailerSales.map(s => `
      <tr style="border-bottom:1px solid #eee">
        <td style="padding:8px 12px;font-family:monospace;font-size:12px">${s.invoice_number}</td>
        <td style="padding:8px 12px">${s.date}</td>
        <td style="padding:8px 12px">${s.items.map(i => i.name).join(', ')}</td>
        <td style="padding:8px 12px;text-align:right">${s.delivery_status}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:600">${s.total_amount.toFixed(2)}</td>
      </tr>`).join('')

    const total = retailerSales.reduce((s, sale) => s + sale.total_amount, 0)

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Statement — ${selectedRetailer.name}</title>
<style>body{font-family:Arial,sans-serif;padding:40px;color:#1a1a2e}h1{color:#0f1b35;margin-bottom:4px}h2{color:#888;font-size:14px;font-weight:normal;margin-bottom:24px}table{width:100%;border-collapse:collapse}thead{background:#f5f5f0}th{padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#555}.total-row td{padding:12px;font-weight:700;background:#f5f5f0}</style>
</head><body>
<h1>Account Statement — ${selectedRetailer.name}</h1>
<h2>Adam Store · Generated ${new Date().toLocaleDateString()} · Outstanding Balance: ${selectedRetailer.balance.toFixed(2)}</h2>
<table><thead><tr><th>Invoice</th><th>Date</th><th>Items</th><th>Status</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr class="total-row"><td colspan="4" style="text-align:right;padding:12px">Total</td><td style="text-align:right;padding:12px;font-weight:700">${total.toFixed(2)}</td></tr></tfoot>
</table>
<script>window.print()</script></body></html>`
    const w = window.open('', '_blank', 'width=820,height=650')
    w?.document.write(html); w?.document.close()
  }

  const TABS: { key: ReportTab; label: string }[] = [
    { key: 'pnl', label: tr.pnlReport },
    { key: 'orders', label: tr.ordersReport },
    { key: 'materials', label: tr.materialsUsageReport },
    { key: 'retailers', label: tr.retailerStatements },
  ]

  const totalPLRevenue = monthPL.reduce((s, m) => s + m.revenue, 0)
  const totalPLExpenses = monthPL.reduce((s, m) => s + m.expenses, 0)
  const totalPLNet = monthPL.reduce((s, m) => s + m.net, 0)

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

  return (
    <div className="min-h-screen bg-[#f5f5f0]">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.reports}</h1>
          <p className="text-gray-500 text-sm mt-1">{tr.appName} · {tr.appTagline}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'bg-[#0f1b35] text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-[#c9a84c]/40'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* P&L Report */}
        {tab === 'pnl' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                <p className="text-sm text-gray-500">{tr.totalRevenue}</p>
                <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">{totalPLRevenue.toFixed(2)}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                <p className="text-sm text-gray-500">{tr.totalExpenses}</p>
                <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">{totalPLExpenses.toFixed(2)}</p>
              </div>
              <div className={`${totalPLNet >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'} rounded-xl p-5 border`}>
                <p className="text-sm text-gray-500">{tr.netProfit}</p>
                <p className={`text-2xl font-bold tabular-nums mt-1 ${totalPLNet >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                  {totalPLNet.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-[#0f1b35]">{tr.pnlReport}</h2>
                <button onClick={printPL}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">
                  {tr.printReport}
                </button>
              </div>
              {monthPL.length === 0 ? (
                <div className="p-12 text-center"><p className="text-gray-500 text-sm">{tr.noReportData}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.month}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.revenue}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.expenses}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.netProfit}</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {monthPL.map(m => (
                        <tr key={m.yearMonth} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-[#0f1b35]">
                            {m.yearMonth}
                            {m.isClosed && (
                              <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{tr.closedMonth}</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-green-700 font-medium">
                            {m.revenue.toFixed(2)}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-red-600 font-medium">
                            {m.expenses.toFixed(2)}
                          </td>
                          <td className={`px-5 py-3.5 text-right tabular-nums font-bold ${m.net >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                            {m.net >= 0 ? '+' : ''}{m.net.toFixed(2)}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                              {m.revenue > 0 && (
                                <div
                                  className="h-full bg-green-400 rounded-full"
                                  style={{ width: `${Math.min(100, (m.revenue / (m.revenue + m.expenses)) * 100)}%` }}
                                />
                              )}
                            </div>
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

        {/* Orders Report */}
        {tab === 'orders' && (
          <div className="space-y-4">
            {/* Date filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500 whitespace-nowrap">{tr.dateFrom}</label>
                <input type="date" value={orderDateFrom} onChange={e => setOrderDateFrom(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f1b35]" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500 whitespace-nowrap">{tr.dateTo}</label>
                <input type="date" value={orderDateTo} onChange={e => setOrderDateTo(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f1b35]" />
              </div>
              {(orderDateFrom || orderDateTo) && (
                <button onClick={() => { setOrderDateFrom(''); setOrderDateTo('') }}
                  className="text-sm text-gray-400 hover:text-gray-600">× {tr.all}</button>
              )}
            </div>

            {/* By stage */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-semibold text-[#0f1b35] mb-4">{tr.pipeline} ({filteredOrders.length} orders)</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {STAGES.map(s => (
                  <div key={s} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                    <p className="text-2xl font-bold text-[#0f1b35]">{ordersByStage[s]}</p>
                    <p className="text-xs text-gray-500 mt-1">{stageLabels[s]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* By status */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: 'active', label: tr.activeOrders, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100' },
                { key: 'completed', label: tr.completedOrders, color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
                { key: 'cancelled', label: tr.cancelled, color: 'text-red-700', bg: 'bg-red-50 border-red-100' },
              ].map(s => (
                <div key={s.key} className={`rounded-xl p-5 border ${s.bg}`}>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${s.color}`}>
                    {filteredOrders.filter(o => o.status === s.key).length}
                  </p>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-[#0f1b35]">{tr.ordersReport}</h2>
              </div>
              {filteredOrders.length === 0 ? (
                <div className="p-12 text-center"><p className="text-gray-500 text-sm">{tr.noReportData}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.orderNumber}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.customerName}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.currentStage}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.status}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.createdAt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.slice(0, 100).map(o => (
                        <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 font-mono text-xs text-gray-500">{o.order_number}</td>
                          <td className="px-5 py-3 font-medium text-[#0f1b35]">{o.customer_name}</td>
                          <td className="px-5 py-3 text-gray-500">{stageLabels[o.current_stage]}</td>
                          <td className="px-5 py-3 capitalize text-gray-500">{o.status}</td>
                          <td className="px-5 py-3 text-gray-400">{o.created_at.split('T')[0]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Materials Usage Report */}
        {tab === 'materials' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-[#0f1b35]">{tr.materialsUsageReport}</h2>
            </div>
            {materialUsage.length === 0 ? (
              <div className="p-12 text-center"><p className="text-gray-500 text-sm">{tr.noReportData}</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.materialName}</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.materialCode}</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.unit}</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.totalIn}</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.totalOut}</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.netChange}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialUsage.map(m => (
                      <tr key={m.materialId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-[#0f1b35]">{m.name}</td>
                        <td className="px-5 py-3.5 font-mono text-xs text-gray-400">{m.code}</td>
                        <td className="px-5 py-3.5 text-gray-500 capitalize">{m.unit}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-green-700 font-medium">
                          +{m.totalIn.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-red-600 font-medium">
                          −{m.totalOut.toLocaleString()}
                        </td>
                        <td className={`px-5 py-3.5 text-right tabular-nums font-bold ${m.net >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                          {m.net >= 0 ? '+' : ''}{m.net.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Retailer Statements */}
        {tab === 'retailers' && (
          <div className="space-y-4">
            {/* Retailer picker */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <select
                value={selectedRetailerId}
                onChange={e => loadRetailerSales(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f1b35] sm:w-72">
                <option value="">{tr.selectRetailer}</option>
                {retailers.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {tr.balance}: {r.balance.toFixed(2)}
                  </option>
                ))}
              </select>
              {selectedRetailer && retailerSales.length > 0 && (
                <button onClick={printRetailerStatement}
                  className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">
                  {tr.printReport}
                </button>
              )}
            </div>

            {selectedRetailer && (
              <>
                {/* Retailer info */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500">{tr.retailerName}</p>
                    <p className="font-semibold text-[#0f1b35] mt-1">{selectedRetailer.name}</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500">{tr.retailerType}</p>
                    <p className="font-semibold text-[#0f1b35] mt-1 capitalize">
                      {selectedRetailer.type === 'wholesale' ? tr.wholesale : tr.retail}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 shadow-sm">
                    <p className="text-xs text-gray-500">{tr.balance}</p>
                    <p className="font-bold text-blue-700 tabular-nums mt-1">{selectedRetailer.balance.toFixed(2)}</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500">{tr.totalAmount}</p>
                    <p className="font-semibold text-[#0f1b35] tabular-nums mt-1">
                      {retailerSales.reduce((s, sale) => s + sale.total_amount, 0).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Sales list */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {retailerSales.length === 0 ? (
                    <div className="p-12 text-center"><p className="text-gray-500 text-sm">{tr.noSales}</p></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50">
                            <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.invoiceNumber}</th>
                            <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.date}</th>
                            <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.saleItems}</th>
                            <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.deliveryStatusLabel}</th>
                            <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.totalAmount}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {retailerSales.map(sale => (
                            <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3 font-mono text-xs text-gray-500">{sale.invoice_number}</td>
                              <td className="px-5 py-3 text-gray-500">{sale.date}</td>
                              <td className="px-5 py-3 text-gray-500 max-w-xs truncate">
                                {sale.items.map(i => `${i.name} ×${i.quantity}`).join(', ')}
                              </td>
                              <td className="px-5 py-3 text-gray-500 capitalize">{sale.delivery_status.replace(/_/g, ' ')}</td>
                              <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#0f1b35]">
                                {sale.total_amount.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {!selectedRetailerId && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                <p className="text-gray-500 text-sm">{tr.selectRetailer}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
