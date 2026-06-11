'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { useToast } from '@/contexts/ToastContext'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import type { Expense, Revenue, MonthClose, Vendor, Order, ExpenseCategory, RevenueType } from '@/lib/types'

// ── Constants ────────────────────────────────────────────────────────────────

const EXPENSE_CATS: ExpenseCategory[] = ['salary', 'rent', 'utilities', 'materials', 'transport', 'manufacturing', 'other']
const REVENUE_TYPES: RevenueType[] = ['sales', 'delivery_fees', 'other']

const CAT_COLOR: Record<ExpenseCategory, string> = {
  salary:        'bg-blue-100   text-blue-700   border-blue-200',
  rent:          'bg-purple-100 text-purple-700 border-purple-200',
  utilities:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  materials:     'bg-orange-100 text-orange-700 border-orange-200',
  transport:     'bg-cyan-100   text-cyan-700   border-cyan-200',
  manufacturing: 'bg-rose-100   text-rose-700   border-rose-200',
  other:         'bg-gray-100   text-gray-700   border-gray-200',
}

const REV_COLOR: Record<RevenueType, string> = {
  sales:         'bg-green-100 text-green-700 border-green-200',
  delivery_fees: 'bg-teal-100  text-teal-700  border-teal-200',
  other:         'bg-gray-100  text-gray-700  border-gray-200',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0]

function fmt(n: number, lang: string) {
  return n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getLast6Months() {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    }
  })
}

function getLast12Months() {
  const now = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }
  })
}

// ── Bar chart (no library) ────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; revenue: number; expenses: number }[] }) {
  const maxVal = Math.max(...data.flatMap(d => [d.revenue, d.expenses]), 1)
  const H = 110; const BW = 18; const GAP = 3; const GW = BW * 2 + GAP + 16
  const PL = 48; const PT = 8; const PB = 26; const W = PL + data.length * GW + 8

  return (
    <svg viewBox={`0 0 ${W} ${H + PT + PB}`} className="w-full overflow-visible">
      {[0, 0.5, 1].map(f => {
        const val = Math.round(maxVal * f)
        const y = PT + H * (1 - f)
        return (
          <g key={f}>
            <line x1={PL} y1={y} x2={W - 8} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
              {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
            </text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const x = PL + i * GW
        const rH = maxVal > 0 ? (d.revenue / maxVal) * H : 0
        const eH = maxVal > 0 ? (d.expenses / maxVal) * H : 0
        return (
          <g key={d.label}>
            <rect x={x} y={PT + H - rH} width={BW} height={Math.max(rH, 1)} fill="#22c55e" rx="2" />
            <rect x={x + BW + GAP} y={PT + H - eH} width={BW} height={Math.max(eH, 1)} fill="#ef4444" rx="2" />
            <text x={x + BW} y={H + PT + PB - 6} textAnchor="middle" fontSize="9" fill="#6b7280">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Form types ────────────────────────────────────────────────────────────────

interface ExpenseForm { date: string; category: ExpenseCategory; amount: string; description: string; vendor_id: string }
interface RevenueForm { date: string; type: RevenueType; amount: string; description: string; order_id: string }

const emptyExpForm = (): ExpenseForm => ({ date: todayStr(), category: 'other', amount: '', description: '', vendor_id: '' })
const emptyRevForm = (): RevenueForm => ({ date: todayStr(), type: 'sales', amount: '', description: '', order_id: '' })

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const { showToast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<'dashboard' | 'expenses' | 'revenue' | 'close'>('dashboard')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [revenue, setRevenue] = useState<Revenue[]>([])
  const [monthCloses, setMonthCloses] = useState<MonthClose[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [allOrders, setAllOrders] = useState<Pick<Order, 'id' | 'order_number'>[]>([])
  const [fetching, setFetching] = useState(true)

  // Expense CRUD state
  const [filterExpMonth, setFilterExpMonth] = useState('')
  const [filterExpCat, setFilterExpCat] = useState('')
  const [searchExp, setSearchExp] = useState('')
  const [showExpForm, setShowExpForm] = useState(false)
  const [editingExp, setEditingExp] = useState<Expense | null>(null)
  const [expForm, setExpForm] = useState<ExpenseForm>(emptyExpForm())
  const [expSaving, setExpSaving] = useState(false)
  const [expError, setExpError] = useState('')
  const [deleteExpTarget, setDeleteExpTarget] = useState<Expense | null>(null)
  const [deletingExp, setDeletingExp] = useState(false)

  // Revenue CRUD state
  const [filterRevMonth, setFilterRevMonth] = useState('')
  const [filterRevType, setFilterRevType] = useState('')
  const [showRevForm, setShowRevForm] = useState(false)
  const [editingRev, setEditingRev] = useState<Revenue | null>(null)
  const [revForm, setRevForm] = useState<RevenueForm>(emptyRevForm())
  const [revSaving, setRevSaving] = useState(false)
  const [revError, setRevError] = useState('')
  const [deleteRevTarget, setDeleteRevTarget] = useState<Revenue | null>(null)
  const [deletingRev, setDeletingRev] = useState(false)

  // Monthly close state
  const [closeMonthSel, setCloseMonthSel] = useState('')
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [closing, setClosing] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    fetchAll()
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const cutoff = `${new Date().getFullYear() - 2}-01-01`
    const [{ data: exp }, { data: rev }, { data: mc }, { data: ven }, { data: ord }] = await Promise.all([
      supabase.from('expenses').select('*, vendors(id, name)').gte('date', cutoff).order('date', { ascending: false }),
      supabase.from('revenue').select('*, orders(order_number)').gte('date', cutoff).order('date', { ascending: false }),
      supabase.from('month_closes').select('*').order('year_month', { ascending: false }),
      supabase.from('vendors').select('*').order('name'),
      supabase.from('orders').select('id, order_number').order('order_number', { ascending: false }).limit(200),
    ])
    setExpenses(exp ?? [])
    setRevenue(rev ?? [])
    setMonthCloses(mc ?? [])
    setVendors(ven ?? [])
    setAllOrders(ord ?? [])
    setFetching(false)
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const closedSet = new Set(monthCloses.map(m => m.year_month))
  const isClosed = (date: string) => closedSet.has(date.substring(0, 7))
  const currentYM = new Date().toISOString().substring(0, 7)

  const curRev = revenue.filter(r => r.date.startsWith(currentYM)).reduce((s, r) => s + r.amount, 0)
  const curExp = expenses.filter(e => e.date.startsWith(currentYM)).reduce((s, e) => s + e.amount, 0)
  const netProfit = curRev - curExp
  const vendorOwed = vendors.reduce((s, v) => s + v.balance, 0)

  const chartMonths = getLast6Months()
  const chartData = chartMonths.map(m => ({
    label: m.label,
    revenue: revenue.filter(r => r.date.startsWith(m.key)).reduce((s, r) => s + r.amount, 0),
    expenses: expenses.filter(e => e.date.startsWith(m.key)).reduce((s, e) => s + e.amount, 0),
  }))

  const catBreakdown = EXPENSE_CATS
    .map(cat => ({ cat, total: expenses.filter(e => e.date.startsWith(currentYM) && e.category === cat).reduce((s, e) => s + e.amount, 0) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)

  const last12 = getLast12Months()
  const availableToClose = last12.filter(m => !closedSet.has(m.key))

  const filteredExp = expenses.filter(e => {
    if (filterExpMonth && !e.date.startsWith(filterExpMonth)) return false
    if (filterExpCat && e.category !== filterExpCat) return false
    if (searchExp && !e.description.toLowerCase().includes(searchExp.toLowerCase())) return false
    return true
  })

  const filteredRev = revenue.filter(r => {
    if (filterRevMonth && !r.date.startsWith(filterRevMonth)) return false
    if (filterRevType && r.type !== filterRevType) return false
    return true
  })

  // Preview totals for the month being closed
  const closeRevTotal = closeMonthSel ? revenue.filter(r => r.date.startsWith(closeMonthSel)).reduce((s, r) => s + r.amount, 0) : 0
  const closeExpTotal = closeMonthSel ? expenses.filter(e => e.date.startsWith(closeMonthSel)).reduce((s, e) => s + e.amount, 0) : 0

  // ── Labels ─────────────────────────────────────────────────────────────────

  const catLabel = (c: ExpenseCategory): string => ({
    salary: tr.salary, rent: tr.rent, utilities: tr.utilities,
    materials: tr.materials, transport: tr.transport,
    manufacturing: tr.manufacturing, other: tr.other,
  }[c] ?? c)

  const revLabel = (t: RevenueType): string => ({
    sales: tr.sales, delivery_fees: tr.deliveryFees, other: tr.other,
  }[t])

  function monthLabel(key: string) {
    const [y, m] = key.split('-')
    return new Date(parseInt(y), parseInt(m) - 1, 1)
      .toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { month: 'long', year: 'numeric' })
  }

  // ── Expense handlers ───────────────────────────────────────────────────────

  function openAddExp() { setEditingExp(null); setExpForm(emptyExpForm()); setExpError(''); setShowExpForm(true) }

  function openEditExp(e: Expense) {
    setEditingExp(e)
    setExpForm({ date: e.date, category: e.category, amount: String(e.amount), description: e.description, vendor_id: e.vendor_id ?? '' })
    setExpError(''); setShowExpForm(true)
  }

  function setEF(k: keyof ExpenseForm, v: string) { setExpForm(p => ({ ...p, [k]: v })) }

  async function handleSaveExp() {
    setExpError('')
    if (!expForm.description.trim()) { setExpError(tr.required); return }
    const amt = parseFloat(expForm.amount)
    if (!amt || amt <= 0) { setExpError(tr.required); return }
    if (isClosed(expForm.date)) { setExpError(tr.monthIsClosed); return }
    setExpSaving(true)

    const payload = {
      date: expForm.date, category: expForm.category, amount: amt,
      description: expForm.description.trim(),
      vendor_id: expForm.vendor_id || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = editingExp
      ? await supabase.from('expenses').update(payload).eq('id', editingExp.id)
      : await supabase.from('expenses').insert({ ...payload, created_by: profile?.id })

    if (error) { setExpError(error.message); setExpSaving(false); return }

    // Auto-create vendor transaction when a new expense is linked to a vendor
    if (!editingExp && expForm.vendor_id) {
      const vendor = vendors.find(v => v.id === expForm.vendor_id)
      if (vendor) {
        await supabase.from('vendor_transactions').insert({
          vendor_id: expForm.vendor_id,
          type: 'purchase',
          amount: amt,
          notes: `Expense: ${expForm.description.trim()}`,
          created_by: profile?.id,
        })
        await supabase.from('vendors').update({
          balance: vendor.balance + amt,
          updated_at: new Date().toISOString(),
        }).eq('id', expForm.vendor_id)
      }
    }

    showToast(tr.savedOk)
    setExpSaving(false); setShowExpForm(false); fetchAll()
  }

  async function handleDeleteExp() {
    if (!deleteExpTarget) return
    setDeletingExp(true)
    await supabase.from('expenses').delete().eq('id', deleteExpTarget.id)
    setDeletingExp(false); setDeleteExpTarget(null); fetchAll()
  }

  // ── Revenue handlers ───────────────────────────────────────────────────────

  function openAddRev() { setEditingRev(null); setRevForm(emptyRevForm()); setRevError(''); setShowRevForm(true) }

  function openEditRev(r: Revenue) {
    setEditingRev(r)
    setRevForm({ date: r.date, type: r.type, amount: String(r.amount), description: r.description, order_id: r.order_id ?? '' })
    setRevError(''); setShowRevForm(true)
  }

  function setRF(k: keyof RevenueForm, v: string) { setRevForm(p => ({ ...p, [k]: v })) }

  async function handleSaveRev() {
    setRevError('')
    if (!revForm.description.trim()) { setRevError(tr.required); return }
    const amt = parseFloat(revForm.amount)
    if (!amt || amt <= 0) { setRevError(tr.required); return }
    if (isClosed(revForm.date)) { setRevError(tr.monthIsClosed); return }
    setRevSaving(true)

    const payload = {
      date: revForm.date, type: revForm.type, amount: amt,
      description: revForm.description.trim(),
      order_id: revForm.order_id || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = editingRev
      ? await supabase.from('revenue').update(payload).eq('id', editingRev.id)
      : await supabase.from('revenue').insert({ ...payload, created_by: profile?.id })

    if (error) { setRevError(error.message); setRevSaving(false); return }
    showToast(tr.savedOk)
    setRevSaving(false); setShowRevForm(false); fetchAll()
  }

  async function handleDeleteRev() {
    if (!deleteRevTarget) return
    setDeletingRev(true)
    await supabase.from('revenue').delete().eq('id', deleteRevTarget.id)
    setDeletingRev(false); setDeleteRevTarget(null); fetchAll()
  }

  // ── Monthly close ──────────────────────────────────────────────────────────

  async function handleCloseMonth() {
    if (!closeMonthSel) return
    setClosing(true)
    await supabase.from('month_closes').insert({
      year_month: closeMonthSel,
      total_revenue: closeRevTotal,
      total_expenses: closeExpTotal,
      net_profit: closeRevTotal - closeExpTotal,
      closed_by: profile?.id,
      closed_at: new Date().toISOString(),
    })
    setClosing(false); setShowCloseConfirm(false); setCloseMonthSel(''); fetchAll()
  }

  // ── Print statement ────────────────────────────────────────────────────────

  function printStatement(mc: MonthClose) {
    const mRevs = revenue.filter(r => r.date.startsWith(mc.year_month))
    const mExps = expenses.filter(e => e.date.startsWith(mc.year_month))
    const label = monthLabel(mc.year_month)
    const revRows = mRevs.map(r => `<tr><td>${r.date}</td><td>${r.description}</td><td>${revLabel(r.type)}</td><td style="text-align:right">${fmt(r.amount, 'en')}</td></tr>`).join('')
    const expRows = mExps.map(e => `<tr><td>${e.date}</td><td>${e.description}</td><td>${catLabel(e.category)}</td><td style="text-align:right">${fmt(e.amount, 'en')}</td></tr>`).join('')

    const html = `<!DOCTYPE html><html><head><title>${label}</title><style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111}
      h1{color:#0f1b35;border-bottom:3px solid #c9a84c;padding-bottom:8px;margin-bottom:24px}
      h2{color:#0f1b35;margin-top:28px;font-size:16px}
      .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:20px 0}
      .stat{background:#f5f5f0;padding:14px 18px;border-radius:8px}
      .stat-label{font-size:12px;color:#6b7280}
      .stat-value{font-size:22px;font-weight:700;margin-top:4px}
      .green{color:#16a34a}.red{color:#dc2626}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
      th{background:#f5f5f0;text-align:left;padding:8px 10px;border-bottom:2px solid #e5e7eb}
      td{padding:7px 10px;border-bottom:1px solid #e5e7eb}
      .footer{margin-top:32px;color:#9ca3af;font-size:11px}
    </style></head><body>
    <h1>${label} — ${tr.monthStatement}</h1>
    <div class="summary">
      <div class="stat"><div class="stat-label">${tr.totalRevenue}</div><div class="stat-value green">${fmt(mc.total_revenue, 'en')}</div></div>
      <div class="stat"><div class="stat-label">${tr.totalExpenses}</div><div class="stat-value red">${fmt(mc.total_expenses, 'en')}</div></div>
      <div class="stat"><div class="stat-label">${tr.netProfit}</div><div class="stat-value ${mc.net_profit >= 0 ? 'green' : 'red'}">${fmt(mc.net_profit, 'en')}</div></div>
    </div>
    <h2>${tr.revenue} (${mRevs.length})</h2>
    <table><thead><tr><th>${tr.date}</th><th>${tr.description}</th><th>${tr.revenueType}</th><th style="text-align:right">${tr.amount}</th></tr></thead><tbody>${revRows}</tbody></table>
    <h2>${tr.expenses} (${mExps.length})</h2>
    <table><thead><tr><th>${tr.date}</th><th>${tr.description}</th><th>${tr.expenseCategory}</th><th style="text-align:right">${tr.amount}</th></tr></thead><tbody>${expRows}</tbody></table>
    <p class="footer">${tr.closedAt}: ${new Date(mc.closed_at).toLocaleDateString()}</p>
    <script>window.print()</script></body></html>`

    const w = window.open('', '_blank', 'width=820,height=650')
    w?.document.write(html)
    w?.document.close()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading || fetching) {
    return (
      <div className="min-h-screen bg-[#f5f5f0]"><Navbar />
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.finance}</h1>
            <p className="text-gray-500 text-sm mt-1">{tr.appName} · {tr.appTagline}</p>
          </div>
          <div className="flex gap-2">
            {tab === 'expenses' && profile?.role === 'manager' && (
              <Button onClick={openAddExp}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                {tr.addExpense}
              </Button>
            )}
            {tab === 'revenue' && profile?.role === 'manager' && (
              <Button onClick={openAddRev}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                {tr.addRevenue}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(['dashboard', 'expenses', 'revenue', 'close'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium border whitespace-nowrap transition-all ${
                tab === t ? 'bg-[#0f1b35] text-white border-[#0f1b35]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              {t === 'dashboard' ? tr.financeDashboard : t === 'expenses' ? tr.expensesTab : t === 'revenue' ? tr.revenueTab : tr.monthlyCloseTab}
            </button>
          ))}
        </div>

        {/* ── Dashboard ──────────────────────────────────────────────────────── */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <div>
              <h2 className="font-semibold text-[#0f1b35] mb-3">{tr.financialSummary} — {monthLabel(currentYM)}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-500">{tr.totalRevenue}</p>
                  <p className="text-2xl font-bold mt-1 text-green-600 tabular-nums">{fmt(curRev, lang)}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-xs text-gray-500">{tr.totalExpenses}</p>
                  <p className="text-2xl font-bold mt-1 text-red-600 tabular-nums">{fmt(curExp, lang)}</p>
                </div>
                <div className={`rounded-xl p-5 border shadow-sm ${netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-xs text-gray-500">{tr.netProfit}</p>
                  <p className={`text-2xl font-bold mt-1 tabular-nums ${netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(netProfit, lang)}</p>
                </div>
                <div className={`rounded-xl p-5 border shadow-sm ${vendorOwed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
                  <p className="text-xs text-gray-500">{tr.vendorObligations}</p>
                  <p className={`text-2xl font-bold mt-1 tabular-nums ${vendorOwed > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(vendorOwed, lang)}</p>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#0f1b35]">{tr.revenueVsExpenses} — {tr.last6Months}</h2>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />{tr.revenue}</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />{tr.expenses}</span>
                </div>
              </div>
              <BarChart data={chartData} />
            </div>

            {/* Category breakdown */}
            {catBreakdown.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="font-semibold text-[#0f1b35] mb-4">{tr.expensesByCategory} — {monthLabel(currentYM)}</h2>
                <div className="space-y-3">
                  {catBreakdown.map(({ cat, total }) => (
                    <div key={cat} className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border shrink-0 w-28 text-center ${CAT_COLOR[cat]}`}>{catLabel(cat)}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className="bg-[#0f1b35] h-2 rounded-full" style={{ width: `${curExp > 0 ? (total / curExp) * 100 : 0}%` }} />
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-[#0f1b35] w-24 text-right shrink-0">{fmt(total, lang)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Expenses ───────────────────────────────────────────────────────── */}
        {tab === 'expenses' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Select value={filterExpMonth} onChange={e => setFilterExpMonth(e.target.value)} className="sm:w-52">
                <option value="">{tr.allMonths}</option>
                {last12.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
              <Select value={filterExpCat} onChange={e => setFilterExpCat(e.target.value)} className="sm:w-44">
                <option value="">{tr.allCategories}</option>
                {EXPENSE_CATS.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </Select>
              <Input placeholder={tr.searchExpenses} value={searchExp} onChange={e => setSearchExp(e.target.value)} className="flex-1" />
            </div>

            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 mb-4 border border-gray-200">
              <span className="text-sm text-gray-600">{tr.totalExpenses}</span>
              <span className="font-bold tabular-nums text-red-600">{fmt(filteredExp.reduce((s, e) => s + e.amount, 0), lang)}</span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {filteredExp.length === 0 ? (
                <div className="p-12 text-center"><p className="text-gray-500 text-sm">{tr.noExpenses}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.date}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.description}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.expenseCategory}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.paidTo}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.amount}</th>
                        {profile?.role === 'manager' && <th className="w-24 px-5 py-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExp.map(e => {
                        const closed = isClosed(e.date)
                        return (
                          <tr key={e.id} className={`border-b border-gray-50 transition-colors ${closed ? 'bg-gray-50/60' : 'hover:bg-gray-50'}`}>
                            <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(e.date, lang)}</td>
                            <td className="px-5 py-3.5 text-[#0f1b35]">{e.description}</td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full border ${CAT_COLOR[e.category]}`}>{catLabel(e.category)}</span>
                            </td>
                            <td className="px-5 py-3.5 text-gray-500">{(e.vendors as { name?: string } | undefined)?.name ?? '—'}</td>
                            <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-red-600">{fmt(e.amount, lang)}</td>
                            {profile?.role === 'manager' && (
                              <td className="px-5 py-3.5 text-right">
                                {closed
                                  ? <span className="text-xs text-gray-400">{tr.closedMonth}</span>
                                  : <div className="flex items-center justify-end gap-3">
                                      <button onClick={() => openEditExp(e)} className="text-xs text-[#0f1b35] hover:underline font-medium">{tr.edit}</button>
                                      <button onClick={() => setDeleteExpTarget(e)} className="text-xs text-red-500 hover:underline font-medium">{tr.delete}</button>
                                    </div>
                                }
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Revenue ────────────────────────────────────────────────────────── */}
        {tab === 'revenue' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Select value={filterRevMonth} onChange={e => setFilterRevMonth(e.target.value)} className="sm:w-52">
                <option value="">{tr.allMonths}</option>
                {last12.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
              <Select value={filterRevType} onChange={e => setFilterRevType(e.target.value)} className="sm:w-44">
                <option value="">{tr.allTypes}</option>
                {REVENUE_TYPES.map(t => <option key={t} value={t}>{revLabel(t)}</option>)}
              </Select>
            </div>

            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5 mb-4 border border-gray-200">
              <span className="text-sm text-gray-600">{tr.totalRevenue}</span>
              <span className="font-bold tabular-nums text-green-700">{fmt(filteredRev.reduce((s, r) => s + r.amount, 0), lang)}</span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {filteredRev.length === 0 ? (
                <div className="p-12 text-center"><p className="text-gray-500 text-sm">{tr.noRevenue}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.date}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.description}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.revenueType}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.linkedOrder}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.amount}</th>
                        {profile?.role === 'manager' && <th className="w-24 px-5 py-3" />}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRev.map(r => {
                        const closed = isClosed(r.date)
                        return (
                          <tr key={r.id} className={`border-b border-gray-50 transition-colors ${closed ? 'bg-gray-50/60' : 'hover:bg-gray-50'}`}>
                            <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(r.date, lang)}</td>
                            <td className="px-5 py-3.5 text-[#0f1b35]">{r.description}</td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full border ${REV_COLOR[r.type]}`}>{revLabel(r.type)}</span>
                            </td>
                            <td className="px-5 py-3.5 text-gray-500">{(r.orders as { order_number?: string } | undefined)?.order_number ?? '—'}</td>
                            <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-green-700">{fmt(r.amount, lang)}</td>
                            {profile?.role === 'manager' && (
                              <td className="px-5 py-3.5 text-right">
                                {closed
                                  ? <span className="text-xs text-gray-400">{tr.closedMonth}</span>
                                  : <div className="flex items-center justify-end gap-3">
                                      <button onClick={() => openEditRev(r)} className="text-xs text-[#0f1b35] hover:underline font-medium">{tr.edit}</button>
                                      <button onClick={() => setDeleteRevTarget(r)} className="text-xs text-red-500 hover:underline font-medium">{tr.delete}</button>
                                    </div>
                                }
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Monthly Close ──────────────────────────────────────────────────── */}
        {tab === 'close' && (
          <div className="space-y-6">
            {profile?.role === 'manager' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h2 className="font-semibold text-[#0f1b35] mb-4">{tr.closeMonth}</h2>
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <Select label={tr.selectMonthToClose} value={closeMonthSel} onChange={e => setCloseMonthSel(e.target.value)} className="sm:w-64">
                    <option value="">—</option>
                    {availableToClose.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </Select>
                  {closeMonthSel && (
                    <div className="flex flex-wrap gap-4 text-sm pb-0.5">
                      <span className="text-green-700 font-medium">{tr.revenue}: {fmt(closeRevTotal, lang)}</span>
                      <span className="text-red-600 font-medium">{tr.expenses}: {fmt(closeExpTotal, lang)}</span>
                      <span className={`font-bold ${closeRevTotal - closeExpTotal >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {tr.netProfit}: {fmt(closeRevTotal - closeExpTotal, lang)}
                      </span>
                    </div>
                  )}
                  <Button variant="secondary" disabled={!closeMonthSel} onClick={() => setShowCloseConfirm(true)}>
                    {tr.closeMonth}
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-[#0f1b35]">{tr.closedMonths}</h2>
              </div>
              {monthCloses.length === 0 ? (
                <div className="p-12 text-center"><p className="text-gray-500 text-sm">{tr.noClosedMonths}</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.month}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.totalRevenue}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.totalExpenses}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.netProfit}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.closedAt}</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {monthCloses.map(mc => (
                        <tr key={mc.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                              <span className="font-medium text-[#0f1b35]">{monthLabel(mc.year_month)}</span>
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-green-700">{fmt(mc.total_revenue, lang)}</td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-red-600">{fmt(mc.total_expenses, lang)}</td>
                          <td className={`px-5 py-3.5 text-right font-bold tabular-nums ${mc.net_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(mc.net_profit, lang)}</td>
                          <td className="px-5 py-3.5 text-gray-500">{formatDate(mc.closed_at, lang)}</td>
                          <td className="px-5 py-3.5 text-right">
                            <button onClick={() => printStatement(mc)}
                              className="text-xs text-[#c9a84c] hover:underline font-medium">
                              {tr.printStatement}
                            </button>
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
      </main>

      {/* ── Expense form modal ─────────────────────────────────────────────── */}
      <Modal open={showExpForm} onClose={() => setShowExpForm(false)}
        title={editingExp ? tr.editExpense : tr.addExpense}
        footer={<><Button variant="ghost" onClick={() => setShowExpForm(false)} disabled={expSaving}>{tr.cancel}</Button><Button onClick={handleSaveExp} loading={expSaving}>{tr.save}</Button></>}>
        <div className="space-y-4">
          {expError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{expError}</p>}
          <Input label={tr.date} type="date" value={expForm.date} onChange={e => setEF('date', e.target.value)} />
          <Select label={tr.expenseCategory} value={expForm.category} onChange={e => setEF('category', e.target.value as ExpenseCategory)}>
            {EXPENSE_CATS.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
          </Select>
          <Input label={tr.description} value={expForm.description} onChange={e => setEF('description', e.target.value)} />
          <Input label={tr.amount} type="number" min="0.01" step="0.01" value={expForm.amount} onChange={e => setEF('amount', e.target.value)} />
          <Select label={tr.paidTo} value={expForm.vendor_id} onChange={e => setEF('vendor_id', e.target.value)}>
            <option value="">{tr.noVendor}</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </div>
      </Modal>

      {/* ── Revenue form modal ─────────────────────────────────────────────── */}
      <Modal open={showRevForm} onClose={() => setShowRevForm(false)}
        title={editingRev ? tr.editRevenue : tr.addRevenue}
        footer={<><Button variant="ghost" onClick={() => setShowRevForm(false)} disabled={revSaving}>{tr.cancel}</Button><Button onClick={handleSaveRev} loading={revSaving}>{tr.save}</Button></>}>
        <div className="space-y-4">
          {revError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{revError}</p>}
          <Input label={tr.date} type="date" value={revForm.date} onChange={e => setRF('date', e.target.value)} />
          <Select label={tr.revenueType} value={revForm.type} onChange={e => setRF('type', e.target.value as RevenueType)}>
            {REVENUE_TYPES.map(t => <option key={t} value={t}>{revLabel(t)}</option>)}
          </Select>
          <Input label={tr.description} value={revForm.description} onChange={e => setRF('description', e.target.value)} />
          <Input label={tr.amount} type="number" min="0.01" step="0.01" value={revForm.amount} onChange={e => setRF('amount', e.target.value)} />
          <Select label={tr.linkedOrderOptional} value={revForm.order_id} onChange={e => setRF('order_id', e.target.value)}>
            <option value="">{tr.noOrder}</option>
            {allOrders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
          </Select>
        </div>
      </Modal>

      {/* ── Delete confirms ────────────────────────────────────────────────── */}
      <ConfirmModal open={!!deleteExpTarget} onClose={() => setDeleteExpTarget(null)} onConfirm={handleDeleteExp}
        title={tr.delete} message={tr.deleteConfirmExpense} confirmLabel={tr.delete} cancelLabel={tr.cancel} loading={deletingExp} danger />
      <ConfirmModal open={!!deleteRevTarget} onClose={() => setDeleteRevTarget(null)} onConfirm={handleDeleteRev}
        title={tr.delete} message={tr.deleteConfirmRevenue} confirmLabel={tr.delete} cancelLabel={tr.cancel} loading={deletingRev} danger />

      {/* ── Monthly close confirm ──────────────────────────────────────────── */}
      <ConfirmModal open={showCloseConfirm} onClose={() => setShowCloseConfirm(false)} onConfirm={handleCloseMonth}
        title={tr.closeMonth} message={tr.confirmCloseMonth} confirmLabel={tr.closeMonth} cancelLabel={tr.cancel} loading={closing} />
    </div>
  )
}
