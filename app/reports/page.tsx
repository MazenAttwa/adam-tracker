'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { BrandName } from '@/components/layout/BrandName'
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

interface BreakdownRow { key: string; amount: number }
interface VendorSpendRow { name: string; spend: number; balance: number }
interface MfrSpendRow { name: string; spend: number }
interface UsageRow { month: string; qty: number; value: number }

interface LogisticsRow {
  kind: 'order' | 'material'
  ref: string
  date: string
  amount: number
}

interface ProfitRow {
  id: string
  order_number: string
  customer_name: string
  revenue: number
  cost: number
  profit: number
}

type ReportTab = 'pnl' | 'orders' | 'materials' | 'retailers' | 'profit' | 'logistics' | 'spend' | 'usage' | 'breakdown'

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
  const [profitRows, setProfitRows] = useState<ProfitRow[]>([])
  const [logisticsRows, setLogisticsRows] = useState<LogisticsRow[]>([])
  const [vendorSpendRows, setVendorSpendRows] = useState<VendorSpendRow[]>([])
  const [mfrSpendRows, setMfrSpendRows] = useState<MfrSpendRow[]>([])
  const [usageRows, setUsageRows] = useState<UsageRow[]>([])
  const [prodBreakdown, setProdBreakdown] = useState<BreakdownRow[]>([])
  const [expBreakdown, setExpBreakdown] = useState<BreakdownRow[]>([])
  const [orderDateFrom, setOrderDateFrom] = useState('')
  const [orderDateTo, setOrderDateTo] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

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
    setFetching(true)
    fetchAll().finally(() => setFetching(false))
  }, [profile, loading, dateFrom, dateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  function inRange(dateStr: string | null | undefined): boolean {
    if (!dateStr) return true
    const d = dateStr.slice(0, 10)
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    return true
  }

  function applyPreset(k: string) {
    const now = new Date()
    const y = now.getFullYear(), mo = now.getMonth()
    const fmt = (dt: Date) => dt.toISOString().slice(0, 10)
    if (k === 'all') { setDateFrom(''); setDateTo('') }
    else if (k === 'month') { setDateFrom(fmt(new Date(y, mo, 1))); setDateTo(fmt(new Date(y, mo + 1, 0))) }
    else if (k === 'quarter') { const q = Math.floor(mo / 3); setDateFrom(fmt(new Date(y, q * 3, 1))); setDateTo(fmt(new Date(y, q * 3 + 3, 0))) }
    else if (k === 'year') { setDateFrom(fmt(new Date(y, 0, 1))); setDateTo(fmt(new Date(y, 11, 31))) }
  }

  async function fetchAll() {
    await Promise.all([fetchPLData(), fetchOrdersData(), fetchMaterialsData(), fetchRetailersData(), fetchProfitData(), fetchLogisticsData(), fetchSpendData(), fetchUsageData(), fetchBreakdownData()])
  }

  async function fetchBreakdownData() {
    const [{ data: ords }, { data: oms }, { data: mats }, { data: sd }, { data: exps }] = await Promise.all([
      supabase.from('orders').select('id, created_at'),
      supabase.from('order_materials').select('order_id, quantity_needed, material_id'),
      supabase.from('materials').select('id, cost_per_unit'),
      supabase.from('stage_data').select('order_id, stage, data'),
      supabase.from('expenses').select('category, amount'),
    ])
    const orderIds = new Set(((ords ?? []) as { id: string; created_at: string }[]).filter(o => inRange(o.created_at)).map(o => o.id))
    const price: Record<string, number> = {}
    ;((mats ?? []) as { id: string; cost_per_unit: number | null }[]).forEach(m => { price[m.id] = m.cost_per_unit ?? 0 })
    let materials = 0
    ;((oms ?? []) as { order_id: string; quantity_needed: number | null; material_id: string }[]).forEach(om => {
      if (orderIds.has(om.order_id)) materials += (om.quantity_needed ?? 0) * (price[om.material_id] ?? 0)
    })
    const num = (v: unknown) => (typeof v === 'number' ? v : 0)
    let fabric = 0, cutting = 0, printing = 0, finishing = 0, logistics = 0
    ;((sd ?? []) as { order_id: string; stage: string; data: Record<string, unknown> | null }[]).forEach(r => {
      if (!orderIds.has(r.order_id)) return
      const d = r.data ?? {}
      if (r.stage === 'preparation') fabric += num(d['fabric_total_cost'])
      if (r.stage === 'cutting') cutting += num(d['total_cutting_cost'])
      if (r.stage === 'printing') printing += num(d['total_printing_cost'])
      if (r.stage === 'finishing') finishing += num(d['grand_total_finishing_cost'])
      logistics += num(d['logistic_cost'])
    })
    setProdBreakdown(([
      { key: 'materials', amount: materials },
      { key: 'fabric', amount: fabric },
      { key: 'cutting', amount: cutting },
      { key: 'printing', amount: printing },
      { key: 'finishing', amount: finishing },
      { key: 'logistics', amount: logistics },
    ] as BreakdownRow[]).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount))
    const byCat: Record<string, number> = {}
    ;((exps ?? []) as { category: string; amount: number | null }[]).forEach(e => {
      const cat = e.category ?? 'other'
      byCat[cat] = (byCat[cat] ?? 0) + (e.amount ?? 0)
    })
    setExpBreakdown(Object.entries(byCat).map(([key, amount]) => ({ key, amount })).filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount))
  }

  async function fetchSpendData() {
    const [{ data: vends }, { data: vtx }, { data: sd }] = await Promise.all([
      supabase.from('vendors').select('id, name, balance'),
      supabase.from('vendor_transactions').select('vendor_id, type, amount, created_at'),
      supabase.from('stage_data').select('stage, data, updated_at'),
    ])
    const vName: Record<string, string> = {}
    const vBal: Record<string, number> = {}
    ;((vends ?? []) as { id: string; name: string; balance: number | null }[]).forEach(v => { vName[v.id] = v.name; vBal[v.id] = v.balance ?? 0 })
    const vSpend: Record<string, number> = {}
    ;((vtx ?? []) as { vendor_id: string | null; type: string; amount: number | null; created_at: string }[]).forEach(tx => {
      if (tx.type === 'purchase' && tx.vendor_id && inRange(tx.created_at)) vSpend[tx.vendor_id] = (vSpend[tx.vendor_id] ?? 0) + (tx.amount ?? 0)
    })
    const vRows: VendorSpendRow[] = Object.keys(vName).map(vid => ({ name: vName[vid], spend: vSpend[vid] ?? 0, balance: vBal[vid] ?? 0 })).filter(r => r.spend > 0 || r.balance !== 0).sort((a, b) => b.spend - a.spend)
    setVendorSpendRows(vRows)
    const mfr: Record<string, number> = {}
    ;((sd ?? []) as { stage: string; data: Record<string, unknown> | null; updated_at: string | null }[]).forEach(r => {
      if (!inRange(r.updated_at)) return
      const d = r.data ?? {}
      const name = typeof d['manufacturer_name'] === 'string' ? d['manufacturer_name'] as string : ''
      if (r.stage === 'cutting' && name && typeof d['total_cutting_cost'] === 'number') mfr[name] = (mfr[name] ?? 0) + (d['total_cutting_cost'] as number)
      if (r.stage === 'printing' && name && typeof d['total_printing_cost'] === 'number') mfr[name] = (mfr[name] ?? 0) + (d['total_printing_cost'] as number)
      if (r.stage === 'finishing' && Array.isArray(d['manufacturers'])) {
        (d['manufacturers'] as { manufacturer_name?: string; subtotal?: number }[]).forEach(m => {
          if (m.manufacturer_name) mfr[m.manufacturer_name] = (mfr[m.manufacturer_name] ?? 0) + (m.subtotal ?? 0)
        })
      }
    })
    const mRows: MfrSpendRow[] = Object.entries(mfr).map(([name, spend]) => ({ name, spend })).filter(r => r.spend > 0).sort((a, b) => b.spend - a.spend)
    setMfrSpendRows(mRows)
  }

  async function fetchUsageData() {
    const [{ data: mv }, { data: mats }] = await Promise.all([
      supabase.from('stock_movements').select('material_id, type, quantity, created_at'),
      supabase.from('materials').select('id, cost_per_unit'),
    ])
    const price: Record<string, number> = {}
    ;((mats ?? []) as { id: string; cost_per_unit: number | null }[]).forEach(m => { price[m.id] = m.cost_per_unit ?? 0 })
    const byMonth: Record<string, { qty: number; value: number }> = {}
    ;((mv ?? []) as { material_id: string; type: string; quantity: number | null; created_at: string }[]).forEach(m => {
      if (m.type !== 'out' || !inRange(m.created_at)) return
      const month = (m.created_at ?? '').slice(0, 7)
      if (!month) return
      if (!byMonth[month]) byMonth[month] = { qty: 0, value: 0 }
      byMonth[month].qty += m.quantity ?? 0
      byMonth[month].value += (m.quantity ?? 0) * (price[m.material_id] ?? 0)
    })
    const rows: UsageRow[] = Object.entries(byMonth).map(([month, v]) => ({ month, qty: v.qty, value: v.value })).sort((a, b) => a.month.localeCompare(b.month))
    setUsageRows(rows)
  }

  async function fetchLogisticsData() {
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
      if (!inRange(r.updated_at)) return
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
      .filter(m => (m.logistic_cost ?? 0) > 0 && inRange(m.purchase_date ?? m.created_at))
      .map(m => ({ kind: 'material' as const, ref: matName[m.material_id] ?? m.material_id, date: m.purchase_date ?? (m.created_at ? m.created_at.slice(0, 10) : ''), amount: m.logistic_cost ?? 0 }))
    const rows = [...orderRows, ...matRows].sort((a, b) => b.amount - a.amount)
    setLogisticsRows(rows)
  }

  async function fetchProfitData() {
    const [{ data: ords }, { data: sd }, { data: oms }, { data: mats }] = await Promise.all([
      supabase.from('orders').select('id, order_number, customer_name, created_at').limit(1000),
      supabase.from('stage_data').select('order_id, stage, data'),
      supabase.from('order_materials').select('order_id, quantity_needed, material_id'),
      supabase.from('materials').select('id, cost_per_unit'),
    ])
    const price: Record<string, number> = {}
    ;((mats ?? []) as { id: string; cost_per_unit: number | null }[]).forEach(m => { price[m.id] = m.cost_per_unit ?? 0 })
    const matCost: Record<string, number> = {}
    ;((oms ?? []) as { order_id: string; quantity_needed: number | null; material_id: string }[]).forEach(om => {
      matCost[om.order_id] = (matCost[om.order_id] ?? 0) + (om.quantity_needed ?? 0) * (price[om.material_id] ?? 0)
    })
    const byOrder: Record<string, Record<string, Record<string, unknown>>> = {}
    ;((sd ?? []) as { order_id: string; stage: string; data: Record<string, unknown> | null }[]).forEach(r => {
      if (!byOrder[r.order_id]) byOrder[r.order_id] = {}
      byOrder[r.order_id][r.stage] = r.data ?? {}
    })
    const num = (v: unknown) => (typeof v === 'number' ? v : 0)
    const rows: ProfitRow[] = ((ords ?? []) as { id: string; order_number: string; customer_name: string; created_at: string }[]).filter(o => inRange(o.created_at)).map(o => {
      const sm = byOrder[o.id] ?? {}
      const fabric = num(sm['preparation']?.['fabric_total_cost'])
      const cutting = num(sm['cutting']?.['total_cutting_cost'])
      const printing = num(sm['printing']?.['total_printing_cost'])
      const finishing = num(sm['finishing']?.['grand_total_finishing_cost'])
      const logistics = ['preparation', 'cutting', 'printing', 'finishing', 'submitted']
        .reduce((s, st) => s + num(sm[st]?.['logistic_cost']), 0)
      const materials = matCost[o.id] ?? 0
      const cost = materials + fabric + cutting + printing + finishing + logistics
      const revenue = num(sm['received']?.['total_received_revenue'])
      return { id: o.id, order_number: o.order_number, customer_name: o.customer_name, revenue, cost, profit: revenue - cost }
    }).filter(r => r.revenue > 0 || r.cost > 0)
    rows.sort((a, b) => b.revenue - a.revenue || b.profit - a.profit)
    setProfitRows(rows)
  }

  async function fetchPLData() {
    const [{ data: revData }, { data: expData }, { data: closesData }] = await Promise.all([
      supabase.from('revenue').select('date, amount').order('date'),
      supabase.from('expenses').select('date, amount').order('date'),
      supabase.from('month_closes').select('*').order('year_month', { ascending: false }),
    ])

    const revenues = ((revData ?? []) as { date: string; amount: number }[]).filter(r => inRange(r.date))
    const expenses = ((expData ?? []) as { date: string; amount: number }[]).filter(e => inRange(e.date))
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
    { key: 'profit', label: tr.profitPerOrder },
    { key: 'logistics', label: tr.logisticsReport },
    { key: 'spend', label: tr.vendorMfrSpend },
    { key: 'usage', label: tr.materialUsageOverTime },
    { key: 'breakdown', label: tr.costBreakdown },
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
          <h1 className="text-2xl font-bold text-[#0f1b35] flex items-center gap-2.5"><span className="w-1.5 h-7 bg-[#c9a84c] rounded-full" />{tr.reports}</h1>
          <p className="text-gray-500 text-sm mt-1"><BrandName /> · {tr.appTagline}</p>
        </div>

        {/* Global date-range filter */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-sm font-medium text-gray-600">{tr.period}:</span>
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => applyPreset('month')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">{tr.thisMonth}</button>
            <button onClick={() => applyPreset('quarter')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">{tr.thisQuarter}</button>
            <button onClick={() => applyPreset('year')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">{tr.thisYear}</button>
            <button onClick={() => applyPreset('all')} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">{tr.allTime}</button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700" />
            <span className="text-gray-400">-</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700" />
          </div>
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

            {monthPL.length > 0 && (() => {
              const maxV = Math.max(...monthPL.flatMap(x => [x.revenue, x.expenses]), 1)
              return (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-[#0f1b35]">{tr.revenue} · {tr.expenses} · {tr.netProfit}</h2>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />{tr.revenue}</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />{tr.expenses}</span>
                    </div>
                  </div>
                  <div className="flex items-end gap-3 h-48 overflow-x-auto pb-1">
                    {monthPL.map((m, i) => {
                      const rh = (m.revenue / maxV) * 100
                      const eh = (m.expenses / maxV) * 100
                      return (
                        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[52px] h-full justify-end">
                          <div className="flex items-end gap-1 h-full w-full justify-center">
                            <div className="w-4 bg-green-500 rounded-t transition-all" style={{ height: rh + '%' }} title={tr.revenue + ': ' + m.revenue.toFixed(0)} />
                            <div className="w-4 bg-red-400 rounded-t transition-all" style={{ height: eh + '%' }} title={tr.expenses + ': ' + m.expenses.toFixed(0)} />
                          </div>
                          <span className={`text-xs font-semibold tabular-nums ${m.net >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{m.net >= 0 ? '+' : ''}{Math.round(m.net / 1000)}k</span>
                          <span className="text-xs text-gray-400 whitespace-nowrap">{m.yearMonth.slice(5)}/{m.yearMonth.slice(2, 4)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

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
        {tab === 'profit' && (() => {
          const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const totRev = profitRows.reduce((s, r) => s + r.revenue, 0)
          const totCost = profitRows.reduce((s, r) => s + r.cost, 0)
          const totProfit = totRev - totCost
          const completed = profitRows.filter(r => r.revenue > 0)
          const n = completed.length
          const avgRev = n ? completed.reduce((s, r) => s + r.revenue, 0) / n : 0
          const avgProfit = n ? completed.reduce((s, r) => s + r.profit, 0) / n : 0
          const totMargin = totRev > 0 ? (totProfit / totRev) * 100 : 0
          const best = n ? completed.reduce((a, b) => (b.profit > a.profit ? b : a)) : null
          const worst = n ? completed.reduce((a, b) => (b.profit < a.profit ? b : a)) : null
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                  <p className="text-sm text-gray-500">{tr.totalRevenue}</p>
                  <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">{money(totRev)}</p>
                </div>
                <div className="bg-red-50 rounded-xl p-5 border border-red-100">
                  <p className="text-sm text-gray-500">{tr.cost}</p>
                  <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">{money(totCost)}</p>
                </div>
                <div className={`${totProfit >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'} rounded-xl p-5 border`}>
                  <p className="text-sm text-gray-500">{tr.profit} ({totMargin.toFixed(1)}%)</p>
                  <p className={`text-2xl font-bold tabular-nums mt-1 ${totProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{money(totProfit)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-500">{tr.avgOrderValue}</p>
                  <p className="text-lg font-bold text-[#0f1b35] tabular-nums mt-1">{money(avgRev)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-500">{tr.avgProfit}</p>
                  <p className="text-lg font-bold text-[#0f1b35] tabular-nums mt-1">{money(avgProfit)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-500">{tr.avgMargin}</p>
                  <p className="text-lg font-bold text-[#0f1b35] tabular-nums mt-1">{totMargin.toFixed(1)}%</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-500">{tr.completedOrders}</p>
                  <p className="text-lg font-bold text-[#0f1b35] tabular-nums mt-1">{n}</p>
                </div>
              </div>
              {(best || worst) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {best && (
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                      <p className="text-xs text-gray-500">{tr.bestOrder}</p>
                      <p className="text-sm font-semibold text-[#0f1b35] mt-1">{best.order_number} — {best.customer_name}</p>
                      <p className="text-lg font-bold text-blue-700 tabular-nums">+{money(best.profit)}</p>
                    </div>
                  )}
                  {worst && (
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                      <p className="text-xs text-gray-500">{tr.worstOrder}</p>
                      <p className="text-sm font-semibold text-[#0f1b35] mt-1">{worst.order_number} — {worst.customer_name}</p>
                      <p className={`text-lg font-bold tabular-nums ${worst.profit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{worst.profit >= 0 ? '+' : ''}{money(worst.profit)}</p>
                    </div>
                  )}
                </div>
              )}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-[#0f1b35]">{tr.profitPerOrder}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th className="px-5 py-3 font-medium text-gray-600">{tr.orderNumber}</th>
                        <th className="px-5 py-3 font-medium text-gray-600">{tr.customer}</th>
                        <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.revenue}</th>
                        <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.cost}</th>
                        <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.profit}</th>
                        <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.margin}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitRows.map(r => (
                        <tr key={r.id} className="border-b border-gray-50">
                          <td className="px-5 py-3 font-medium text-[#0f1b35] whitespace-nowrap">{r.order_number}</td>
                          <td className="px-5 py-3 text-gray-600">{r.customer_name}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-green-700">{money(r.revenue)}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-gray-700">{money(r.cost)}</td>
                          <td className={`px-5 py-3 text-right tabular-nums font-semibold ${r.profit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{money(r.profit)}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-gray-500">{r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) + '%' : '-'}</td>
                        </tr>
                      ))}
                      {profitRows.length === 0 && (
                        <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">-</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 font-bold">
                        <td className="px-5 py-3" colSpan={2}>{tr.grandTotal}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-green-700">{money(totRev)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{money(totCost)}</td>
                        <td className={`px-5 py-3 text-right tabular-nums ${totProfit >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{money(totProfit)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-600">{totMargin.toFixed(1)}%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )
        })()}

        {tab === 'logistics' && (() => {
          const orderTotal = logisticsRows.filter(r => r.kind === 'order').reduce((s, r) => s + r.amount, 0)
          const matTotal = logisticsRows.filter(r => r.kind === 'material').reduce((s, r) => s + r.amount, 0)
          const total = orderTotal + matTotal
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                  <p className="text-sm text-gray-500">{tr.orderLogistics}</p>
                  <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">{orderTotal.toFixed(2)}</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                  <p className="text-sm text-gray-500">{tr.materialLogistics}</p>
                  <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">{matTotal.toFixed(2)}</p>
                </div>
                <div className="bg-[#0f1b35] rounded-xl p-5">
                  <p className="text-sm text-gray-300">{tr.totalLogistics}</p>
                  <p className="text-2xl font-bold text-white tabular-nums mt-1">{total.toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-[#0f1b35]">{tr.logisticsReport}</h2>
                </div>
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
                      {logisticsRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-5 py-3 font-medium text-[#0f1b35]">{r.ref} <span className="text-xs text-gray-400">({r.kind === 'order' ? tr.orderLogistics : tr.materialLogistics})</span></td>
                          <td className="px-5 py-3 text-gray-500">{r.date || '-'}</td>
                          <td className="px-5 py-3 text-right tabular-nums text-amber-700">{r.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                      {logisticsRows.length === 0 && (
                        <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-400">-</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 font-bold">
                        <td className="px-5 py-3" colSpan={2}>{tr.totalLogistics}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-amber-700">{total.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )
        })()}

        {tab === 'spend' && (() => {
          const vendorTotal = vendorSpendRows.reduce((s, r) => s + r.spend, 0)
          const mfrTotal = mfrSpendRows.reduce((s, r) => s + r.spend, 0)
          const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500">{tr.vendorSpend}</p>
                  <p className="text-2xl font-bold text-[#0f1b35] tabular-nums mt-1">EGP {money(vendorTotal)}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-sm text-gray-500">{tr.manufacturerSpend}</p>
                  <p className="text-2xl font-bold text-[#0f1b35] tabular-nums mt-1">EGP {money(mfrTotal)}</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-[#0f1b35]">{tr.vendorSpend}</h2></div>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left">
                    <th className="px-5 py-3 font-medium text-gray-600">{tr.vendors}</th>
                    <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.totalSpend}</th>
                    <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.balance}</th>
                  </tr></thead>
                  <tbody>
                    {vendorSpendRows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-5 py-3 font-medium text-[#0f1b35]">{r.name}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{money(r.spend)}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-500">{money(r.balance)}</td>
                      </tr>
                    ))}
                    {vendorSpendRows.length === 0 && (<tr><td colSpan={3} className="px-5 py-6 text-center text-gray-400">-</td></tr>)}
                  </tbody>
                </table></div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-[#0f1b35]">{tr.manufacturerSpend}</h2></div>
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 text-left">
                    <th className="px-5 py-3 font-medium text-gray-600">{tr.manufacturers}</th>
                    <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.totalSpend}</th>
                  </tr></thead>
                  <tbody>
                    {mfrSpendRows.map((r, i) => (
                      <tr key={i} onClick={() => router.push('/manufacturers?open=' + encodeURIComponent(r.name))} className="border-b border-gray-50 cursor-pointer hover:bg-[#c9a84c]/5 transition-colors">
                        <td className="px-5 py-3 font-medium text-[#0f1b35]">{r.name} <span className="text-[#c9a84c]">&rarr;</span></td>
                        <td className="px-5 py-3 text-right tabular-nums">{money(r.spend)}</td>
                      </tr>
                    ))}
                    {mfrSpendRows.length === 0 && (<tr><td colSpan={2} className="px-5 py-6 text-center text-gray-400">-</td></tr>)}
                  </tbody>
                </table></div>
              </div>
            </div>
          )
        })()}

        {tab === 'usage' && (() => {
          const totQty = usageRows.reduce((s, r) => s + r.qty, 0)
          const totVal = usageRows.reduce((s, r) => s + r.value, 0)
          const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const qtyFmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-[#0f1b35]">{tr.materialUsageOverTime}</h2></div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 text-left">
                  <th className="px-5 py-3 font-medium text-gray-600">{tr.month}</th>
                  <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.quantityUsed}</th>
                  <th className="px-5 py-3 font-medium text-gray-600 text-right">{tr.value}</th>
                </tr></thead>
                <tbody>
                  {usageRows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-5 py-3 font-medium text-[#0f1b35]">{r.month}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{qtyFmt(r.qty)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-600">EGP {money(r.value)}</td>
                    </tr>
                  ))}
                  {usageRows.length === 0 && (<tr><td colSpan={3} className="px-5 py-6 text-center text-gray-400">-</td></tr>)}
                </tbody>
                <tfoot><tr className="border-t-2 border-gray-200 font-bold">
                  <td className="px-5 py-3">{tr.grandTotal}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{qtyFmt(totQty)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">EGP {money(totVal)}</td>
                </tr></tfoot>
              </table></div>
            </div>
          )
        })()}

        {tab === 'breakdown' && (() => {
          const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          const label = (k: string) => (tr as unknown as Record<string, string>)[k] ?? k
          const prodTotal = prodBreakdown.reduce((s, r) => s + r.amount, 0)
          const expTotal = expBreakdown.reduce((s, r) => s + r.amount, 0)
          return (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-[#0f1b35]">{tr.byStage}</h2>
                  <span className="text-sm text-gray-500 tabular-nums">EGP {money(prodTotal)}</span>
                </div>
                <div className="p-5 space-y-3">
                  {prodBreakdown.map((r, i) => {
                    const pct = prodTotal > 0 ? (r.amount / prodTotal) * 100 : 0
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-[#0f1b35] font-medium">{label(r.key)}</span>
                          <span className="text-gray-600 tabular-nums">{money(r.amount)} · {pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-[#c9a84c] rounded-full" style={{ width: pct + '%' }} />
                        </div>
                      </div>
                    )
                  })}
                  {prodBreakdown.length === 0 && <p className="text-center text-gray-400 py-4">-</p>}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-[#0f1b35]">{tr.byCategory}</h2>
                  <span className="text-sm text-gray-500 tabular-nums">EGP {money(expTotal)}</span>
                </div>
                <div className="p-5 space-y-3">
                  {expBreakdown.map((r, i) => {
                    const pct = expTotal > 0 ? (r.amount / expTotal) * 100 : 0
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-[#0f1b35] font-medium capitalize">{label(r.key)}</span>
                          <span className="text-gray-600 tabular-nums">{money(r.amount)} · {pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full bg-[#0f1b35] rounded-full" style={{ width: pct + '%' }} />
                        </div>
                      </div>
                    )
                  })}
                  {expBreakdown.length === 0 && <p className="text-center text-gray-400 py-4">-</p>}
                </div>
              </div>
            </div>
          )
        })()}

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
