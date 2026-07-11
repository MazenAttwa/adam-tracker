'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { logAudit, diffDetails } from '@/lib/audit'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { BrandName } from '@/components/layout/BrandName'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { printAccountStatement } from '@/lib/accountPdf'
import type { Vendor, VendorCategory, VendorTransaction, VendorTransactionType } from '@/lib/types'

const CATEGORIES: VendorCategory[] = ['fabric', 'printing', 'accessories', 'other']

interface VendorForm {
  name: string; phone: string; category: VendorCategory; notes: string
}
interface TxForm {
  type: VendorTransactionType; amount: string; notes: string
}

const emptyVendor: VendorForm = { name: '', phone: '', category: 'fabric', notes: '' }
const emptyTx: TxForm = { type: 'purchase', amount: '', notes: '' }

interface VendorMaterial { vendorId: string; id: string; name: string; unit: string; qty: number; costPerUnit: number; total: number; photoUrl: string; last: string }

export default function VendorsPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<'vendors' | 'aging'>('vendors')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [transactions, setTransactions] = useState<VendorTransaction[]>([])
  const [vendorMats, setVendorMats] = useState<VendorMaterial[]>([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')

  // Vendor CRUD
  const [showVendorForm, setShowVendorForm] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [vendorForm, setVendorForm] = useState<VendorForm>(emptyVendor)
  const [vendorSaving, setVendorSaving] = useState(false)
  const [vendorError, setVendorError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Transactions modal
  const [txVendor, setTxVendor] = useState<Vendor | null>(null)
  const [showAddTx, setShowAddTx] = useState(false)
  const [txForm, setTxForm] = useState<TxForm>(emptyTx)
  const [txSaving, setTxSaving] = useState(false)
  const [txError, setTxError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    fetchAll()
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [{ data: v }, { data: tx }, { data: mats }, { data: moves }, { data: photos }] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase.from('vendor_transactions').select('*').order('created_at', { ascending: false }),
      supabase.from('materials').select('id, name, unit, cost_per_unit, vendor_id'),
      supabase.from('stock_movements').select('material_id, type, quantity, total_cost, purchase_date, created_at'),
      supabase.from('material_photos').select('material_id, file_path'),
    ])
    setVendors(v ?? [])
    setTransactions(tx ?? [])

    const photoMap = new Map<string, string>()
    ;((photos ?? []) as { material_id: string; file_path: string }[]).forEach(ph => {
      if (!photoMap.has(ph.material_id) && ph.file_path) {
        photoMap.set(ph.material_id, supabase.storage.from('material-photos').getPublicUrl(ph.file_path).data.publicUrl)
      }
    })

    const ins = ((moves ?? []) as { material_id: string; type: string; quantity: number; total_cost: number | null; purchase_date: string | null; created_at: string }[])
      .filter(r => r.type === 'in')

    const vm: VendorMaterial[] = ((mats ?? []) as { id: string; name: string; unit: string; cost_per_unit: number; vendor_id: string | null }[])
      .filter(m => !!m.vendor_id)
      .map(m => {
        const rows = ins.filter(r => r.material_id === m.id)
        const qty = rows.reduce((s, r) => s + (r.quantity || 0), 0)
        const total = rows.reduce((s, r) => s + (r.total_cost ?? (r.quantity || 0) * (m.cost_per_unit || 0)), 0)
        const last = rows.reduce((acc, r) => {
          const d = (r.purchase_date ?? r.created_at ?? '').slice(0, 10)
          return d > acc ? d : acc
        }, '')
        return {
          vendorId: m.vendor_id as string, id: m.id, name: m.name, unit: m.unit,
          qty, costPerUnit: m.cost_per_unit || 0, total, photoUrl: photoMap.get(m.id) ?? '', last,
        }
      })
      .filter(x => x.qty > 0)
    setVendorMats(vm)
    setFetching(false)
  }

  // ── Vendor CRUD ──────────────────────────────────────────────────────────────

  function openAdd() {
    setEditingVendor(null)
    setVendorForm(emptyVendor)
    setVendorError('')
    setShowVendorForm(true)
  }

  function openEdit(v: Vendor) {
    setEditingVendor(v)
    setVendorForm({ name: v.name, phone: v.phone ?? '', category: v.category, notes: v.notes ?? '' })
    setVendorError('')
    setShowVendorForm(true)
  }

  function setV(k: keyof VendorForm, val: string) {
    setVendorForm(p => ({ ...p, [k]: val }))
  }

  async function handleSaveVendor() {
    setVendorError('')
    if (!vendorForm.name.trim()) { setVendorError(tr.required); return }
    setVendorSaving(true)
    const payload = {
      name: vendorForm.name.trim(),
      phone: vendorForm.phone.trim() || null,
      category: vendorForm.category,
      notes: vendorForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (editingVendor) {
      const { error } = await supabase.from('vendors').update(payload).eq('id', editingVendor.id)
      if (error) { setVendorError(error.message); setVendorSaving(false); return }
      logAudit({ id: profile?.id, email: profile?.email }, 'edit', 'vendor', payload.name, diffDetails(
        { name: editingVendor.name, phone: editingVendor.phone ?? '', category: editingVendor.category, notes: editingVendor.notes ?? '' },
        { name: payload.name, phone: payload.phone, category: payload.category, notes: payload.notes },
        { name: 'Name', phone: 'Phone', category: 'Category', notes: 'Notes' },
      ) || (payload.name + ' (no changes)'))
    } else {
      const { error } = await supabase.from('vendors').insert({ ...payload, created_by: profile?.id })
      if (error) { setVendorError(error.message); setVendorSaving(false); return }
      logAudit({ id: profile?.id, email: profile?.email }, 'create', 'vendor', payload.name, 'Created vendor "' + payload.name + '"')
    }
    setVendorSaving(false)
    setShowVendorForm(false)
    fetchAll()
  }

  async function handleDeleteVendor() {
    if (!deleteTarget) return
    setDeleting(true)
    logAudit({ id: profile?.id, email: profile?.email }, 'delete', 'vendor', deleteTarget.name, 'Deleted vendor "' + deleteTarget.name + '"')
    await supabase.from('vendors').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    fetchAll()
  }

  // ── Transactions ─────────────────────────────────────────────────────────────

  function openTxModal(v: Vendor) {
    setTxVendor(v)
    setShowAddTx(false)
    setTxForm(emptyTx)
    setTxError('')
  }

  function setT(k: keyof TxForm, val: string) {
    setTxForm(p => ({ ...p, [k]: val }))
  }

  async function handleSaveTx() {
    setTxError('')
    const amt = parseFloat(txForm.amount)
    if (!txVendor || !amt || amt <= 0) { setTxError(tr.required); return }
    setTxSaving(true)

    const { error } = await supabase.from('vendor_transactions').insert({
      vendor_id: txVendor.id,
      type: txForm.type,
      amount: amt,
      notes: txForm.notes.trim() || null,
      created_by: profile?.id,
    })
    if (error) { setTxError(error.message); setTxSaving(false); return }

    // Update vendor balance: purchase → owe more, payment → owe less
    const delta = txForm.type === 'purchase' ? amt : -amt
    const newBalance = Math.max(0, txVendor.balance + delta)
    await supabase.from('vendors')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', txVendor.id)

    setTxSaving(false)
    setShowAddTx(false)
    setTxForm(emptyTx)
    // Refresh and update txVendor with new balance
    const { data: updatedVendor } = await supabase.from('vendors').select('*').eq('id', txVendor.id).single()
    if (updatedVendor) setTxVendor(updatedVendor as Vendor)
    fetchAll()
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const catLabel = (c: VendorCategory) =>
    c === 'fabric' ? tr.fabric : c === 'printing' ? tr.printing : c === 'accessories' ? tr.accessories : tr.other

  const filtered = vendors.filter(v => {
    if (filterCat && v.category !== filterCat) return false
    const q = search.toLowerCase()
    return v.name.toLowerCase().includes(q) || (v.phone ?? '').includes(q)
  })

  const totalOwed = vendors.reduce((s, v) => s + v.balance, 0)

  // Per-vendor account: purchases (owed), payments (paid), remaining, last purchase date
  function vendorAccount(v: Vendor) {
    const txs = transactions.filter(t => t.vendor_id === v.id)
    const purchases = txs.filter(t => t.type === 'purchase')
    const owed = purchases.reduce((s, t) => s + (t.amount || 0), 0)
    const paid = txs.filter(t => t.type === 'payment').reduce((s, t) => s + (t.amount || 0), 0)
    const last = purchases.length ? purchases.reduce((a, b) => (a.created_at > b.created_at ? a : b)).created_at : ''
    return { owed, paid, remaining: owed - paid, count: purchases.length, last }
  }

  const grand = vendors.reduce((acc, v) => {
    const a = vendorAccount(v)
    return { owed: acc.owed + a.owed, paid: acc.paid + a.paid, remaining: acc.remaining + Math.max(0, a.remaining) }
  }, { owed: 0, paid: 0, remaining: 0 })

  // Aging: vendors with balance > 0, ordered by oldest purchase
  const agingData = vendors
    .filter(v => v.balance > 0)
    .map(v => {
      const vendorPurchases = transactions.filter(t => t.vendor_id === v.id && t.type === 'purchase')
      const oldest = vendorPurchases.length > 0
        ? vendorPurchases.reduce((a, b) => a.created_at < b.created_at ? a : b)
        : null
      const days = oldest
        ? Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 86_400_000)
        : 0
      return { vendor: v, days, oldestDate: oldest?.created_at ?? null }
    })
    .sort((a, b) => b.days - a.days)

  const vendorTxs = txVendor
    ? transactions.filter(t => t.vendor_id === txVendor.id)
    : []

  const vendorStmt = (() => {
    if (!txVendor) return { rows: [] as (VendorTransaction & { running: number })[], owed: 0, paid: 0, remaining: 0, ageDays: 0 }
    const txs = transactions.filter(t => t.vendor_id === txVendor.id).slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
    let running = 0
    const rows = txs.map(t => { running += t.type === 'purchase' ? t.amount : -t.amount; return { ...t, running } })
    const owed = txs.filter(t => t.type === 'purchase').reduce((s, t) => s + t.amount, 0)
    const paid = txs.filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0)
    const remaining = owed - paid
    const oldestPurchase = txs.find(t => t.type === 'purchase')
    const ageDays = remaining > 0.005 && oldestPurchase ? Math.floor((Date.now() - new Date(oldestPurchase.created_at).getTime()) / 86400000) : 0
    return { rows, owed, paid, remaining, ageDays }
  })()

  const fmt = (n: number) => n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function deleteTx(tx: VendorTransaction) {
    if (!txVendor) return
    await supabase.from('vendor_transactions').delete().eq('id', tx.id)
    // Reverse its effect on the balance: purchase added debt, payment reduced it
    const delta = tx.type === 'purchase' ? -tx.amount : tx.amount
    const newBalance = Math.max(0, txVendor.balance + delta)
    await supabase.from('vendors').update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('id', txVendor.id)
    logAudit({ id: profile?.id, email: profile?.email }, 'delete', 'vendor', txVendor.name, 'Deleted a ' + tx.type + ' of ' + tx.amount.toFixed(2) + ' for "' + txVendor.name + '"')
    setTxVendor(prev => (prev ? { ...prev, balance: newBalance } : prev))
    await fetchAll()
  }

  function printVendorStatement() {
    if (!txVendor) return
    printAccountStatement({
      heading: 'Vendor Account', partyName: txVendor.name, partyPhone: txVendor.phone ?? undefined,
      owedLabel: tr.totalOwed, paidLabel: tr.totalPaid, remainingLabel: tr.remaining,
      owed: vendorStmt.owed, paid: vendorStmt.paid, remaining: vendorStmt.remaining,
      debitLabel: tr.purchase, creditLabel: tr.payment, balanceLabel: tr.balance,
      dateLabel: tr.createdAt, descriptionLabel: tr.notes, statementLabel: tr.statement,
      materialsLabel: tr.materialsSupplied,
      materials: vendorMats.filter(m => m.vendorId === txVendor.id).map(m => ({
        name: m.name, qty: m.qty, unit: m.unit, costPerUnit: m.costPerUnit, total: m.total, photoUrl: m.photoUrl, last: m.last,
      })),
      rows: vendorStmt.rows.map(r => ({
        date: formatDate(r.created_at, lang), description: r.notes ?? '',
        debit: r.type === 'purchase' ? r.amount : 0, credit: r.type === 'payment' ? r.amount : 0, running: r.running,
      })),
    })
  }

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
            <h1 className="text-2xl font-bold text-[#0f1b35] flex items-center gap-2.5"><span className="w-1.5 h-7 bg-[#c9a84c] rounded-full" />{tr.vendors}</h1>
            <p className="text-gray-500 text-sm mt-1"><BrandName /> · {tr.appTagline}</p>
          </div>
          {profile?.role === 'manager' && tab === 'vendors' && (
            <Button onClick={openAdd}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {tr.addVendor}
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{tr.totalVendors}</p>
            <p className="text-3xl font-bold mt-1 text-[#0f1b35]">{vendors.length}</p>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{tr.purchase}</p>
            <p className="text-3xl font-bold mt-1 text-[#0f1b35] tabular-nums">{fmt(grand.owed)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-5 border border-green-100 shadow-sm">
            <p className="text-sm text-gray-500">{tr.totalPaid}</p>
            <p className="text-3xl font-bold mt-1 text-green-700 tabular-nums">{fmt(grand.paid)}</p>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm ${grand.remaining > 0.005 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
            <p className="text-sm text-gray-500">{tr.remaining}</p>
            <p className={`text-3xl font-bold mt-1 tabular-nums ${grand.remaining > 0.005 ? 'text-red-600' : 'text-[#0f1b35]'}`}>
              {fmt(grand.remaining)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['vendors', 'aging'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                tab === t
                  ? 'bg-[#0f1b35] text-white border-[#0f1b35]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}>
              {t === 'vendors' ? tr.vendorsTab : tr.agingReport}
            </button>
          ))}
        </div>

        {/* ── Vendors tab ───────────────────────────────────────────────────── */}
        {tab === 'vendors' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Input placeholder={tr.searchVendors} value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
              <Select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="sm:w-48">
                <option value="">{tr.allCategories}</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </Select>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm">{tr.noVendors}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.vendorName}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.vendorPhone}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.vendorCategory}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.purchase}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.totalPaid}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.remaining}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.lastPurchase}</th>
                        {profile?.role === 'manager' && (
                          <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.actions}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(v => (
                        <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-[#0f1b35]">{v.name}</td>
                          <td className="px-5 py-3.5 text-gray-500">{v.phone ?? '—'}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                              {catLabel(v.category)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-[#0f1b35]">
                            {(() => { const a = vendorAccount(v); return a.owed > 0 ? fmt(a.owed) : '\u2014' })()}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-green-700">
                            {(() => { const a = vendorAccount(v); return a.paid > 0 ? fmt(a.paid) : '\u2014' })()}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {(() => {
                              const a = vendorAccount(v)
                              if (a.owed <= 0 && a.paid <= 0) return <span className="text-gray-400">&mdash;</span>
                              const pct = a.owed > 0 ? Math.min(100, Math.round((a.paid / a.owed) * 100)) : 100
                              return (
                                <div className="flex flex-col items-end gap-1">
                                  <span className={`font-semibold tabular-nums ${a.remaining > 0.005 ? 'text-red-600' : 'text-green-700'}`}>{fmt(Math.max(0, a.remaining))}</span>
                                  <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div className="h-full bg-green-500" style={{ width: pct + '%' }} />
                                  </div>
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                            {(() => { const a = vendorAccount(v); return a.last ? formatDate(a.last, lang) + ' (' + a.count + ')' : '\u2014' })()}
                          </td>
                          {profile?.role === 'manager' && (
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <button onClick={() => openTxModal(v)}
                                  className="text-xs text-[#c9a84c] hover:underline font-medium">
                                  {tr.viewTransactions}
                                </button>
                                <button onClick={() => openEdit(v)}
                                  className="text-xs text-[#0f1b35] hover:underline font-medium">
                                  {tr.edit}
                                </button>
                                <button onClick={() => setDeleteTarget(v)}
                                  className="text-xs text-red-500 hover:underline font-medium">
                                  {tr.delete}
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Aging Report tab ──────────────────────────────────────────────── */}
        {tab === 'aging' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {agingData.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">{tr.noOutstanding}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.vendorName}</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.vendorCategory}</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.balance}</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.oldestPurchase}</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.daysOutstanding}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingData.map(({ vendor: v, days, oldestDate }) => {
                      const urgency = days > 60 ? 'text-red-600 bg-red-50' : days > 30 ? 'text-amber-700 bg-amber-50' : 'text-[#0f1b35] bg-gray-50'
                      return (
                        <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-[#0f1b35]">{v.name}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex text-xs font-medium px-2.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                              {catLabel(v.category)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-amber-700">
                            {v.balance.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-3.5 text-gray-500">
                            {oldestDate ? formatDate(oldestDate, lang) : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className={`inline-flex items-center justify-center text-xs font-bold px-2.5 py-1 rounded-full ${urgency}`}>
                              {days}d
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Vendor add/edit modal ──────────────────────────────────────────── */}
      <Modal
        open={showVendorForm}
        onClose={() => setShowVendorForm(false)}
        title={editingVendor ? tr.editVendor : tr.addVendor}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowVendorForm(false)} disabled={vendorSaving}>{tr.cancel}</Button>
            <Button onClick={handleSaveVendor} loading={vendorSaving}>{tr.save}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {vendorError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{vendorError}</p>}
          <Input label={tr.vendorName} value={vendorForm.name} onChange={e => setV('name', e.target.value)} />
          <Input label={tr.vendorPhone} value={vendorForm.phone} onChange={e => setV('phone', e.target.value)} />
          <Select label={tr.vendorCategory} value={vendorForm.category} onChange={e => setV('category', e.target.value as VendorCategory)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
          </Select>
          <Textarea label={tr.vendorNotes} value={vendorForm.notes} onChange={e => setV('notes', e.target.value)} rows={2} />
        </div>
      </Modal>

      {/* ── Transactions modal ─────────────────────────────────────────────── */}
      <Modal
        open={!!txVendor}
        onClose={() => { setTxVendor(null); setShowAddTx(false) }}
        title={txVendor ? `${tr.transactions} — ${txVendor.name}` : tr.transactions}
        footer={
          !showAddTx && profile?.role === 'manager' ? (
            <Button onClick={() => { setShowAddTx(true); setTxForm(emptyTx); setTxError('') }}>
              {tr.addTransaction}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {/* Account summary */}
          {txVendor && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
                  <p className="text-[11px] text-gray-500">{tr.totalOwed}</p>
                  <p className="text-base font-bold text-[#0f1b35] tabular-nums">{fmt(vendorStmt.owed)}</p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-center">
                  <p className="text-[11px] text-gray-500">{tr.totalPaid}</p>
                  <p className="text-base font-bold text-green-700 tabular-nums">{fmt(vendorStmt.paid)}</p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${vendorStmt.remaining > 0.005 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                  <p className="text-[11px] text-gray-500">{tr.remaining}</p>
                  <p className={`text-base font-bold tabular-nums ${vendorStmt.remaining > 0.005 ? 'text-red-600' : 'text-green-700'}`}>{fmt(vendorStmt.remaining)}</p>
                </div>
              </div>
              {(() => {
                const pct = vendorStmt.owed > 0 ? Math.min(100, Math.round((vendorStmt.paid / vendorStmt.owed) * 100)) : (vendorStmt.paid > 0 ? 100 : 0)
                return (
                  <div>
                    <div className="h-3 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-green-500" style={{ width: pct + '%' }} /></div>
                    <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                      <span>{pct}%</span>
                      {vendorStmt.ageDays > 0 && <span className="text-red-600">{tr.aging}: {vendorStmt.ageDays} {tr.daysOverdue}</span>}
                    </div>
                  </div>
                )
              })()}
              <button onClick={printVendorStatement} className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#0f1b35] text-[#0f1b35] hover:bg-[#0f1b35] hover:text-white transition-colors py-2 text-sm font-medium">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                {tr.printPdf}
              </button>
            </div>
          )}

          {/* Add transaction form */}
          {showAddTx && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
              {txError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{txError}</p>}
              <Select label={tr.transactionType} value={txForm.type} onChange={e => setT('type', e.target.value as VendorTransactionType)}>
                <option value="purchase">{tr.purchase}</option>
                <option value="payment">{tr.payment}</option>
              </Select>
              <Input label={tr.amount} type="number" min="0.01" step="0.01"
                value={txForm.amount} onChange={e => setT('amount', e.target.value)} />
              <Textarea label={tr.notes} value={txForm.notes} onChange={e => setT('notes', e.target.value)} rows={2} />
              <div className="flex gap-2 pt-1">
                <Button onClick={handleSaveTx} loading={txSaving}>{tr.save}</Button>
                <Button variant="ghost" onClick={() => setShowAddTx(false)} disabled={txSaving}>{tr.cancel}</Button>
              </div>
            </div>
          )}

          {/* Materials supplied by this vendor */}
          {txVendor && vendorMats.filter(m => m.vendorId === txVendor.id).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[#0f1b35] mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#c9a84c] rounded-full" />{tr.materialsSupplied}
              </h3>
              <div className="rounded-xl border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5"></th>
                      <th className="text-left px-3 py-2.5 font-medium text-gray-600">{tr.materialName}</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-600">{tr.quantity}</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-600">{tr.costPerUnit}</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-600">{tr.total}</th>
                      <th className="text-left px-3 py-2.5 font-medium text-gray-600">{tr.lastPurchase}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorMats.filter(m => m.vendorId === txVendor.id).map(m => (
                      <tr key={m.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2">
                          {m.photoUrl
                            ? <img src={m.photoUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-gray-100" />
                            : <div className="w-11 h-11 rounded-lg bg-gray-100" />}
                        </td>
                        <td className="px-3 py-2 font-medium text-[#0f1b35]">{m.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{m.qty.toLocaleString()} {m.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmt(m.costPerUnit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-600">{fmt(m.total)}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{m.last || '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="px-3 py-2.5" colSpan={4}>{tr.total}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-600">
                        {fmt(vendorMats.filter(m => m.vendorId === txVendor.id).reduce((s, m) => s + m.total, 0))}
                      </td>
                      <td className="px-3 py-2.5"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transaction history */}
          {vendorTxs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{tr.noTransactions}</p>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.createdAt}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.transactionType}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">{tr.amount}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.notes}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">{tr.balance}</th>
                    {profile?.role === 'manager' && <th className="px-3 py-2.5"></th>}
                  </tr>
                </thead>
                <tbody>
                  {vendorStmt.rows.map(tx => (
                    <tr key={tx.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{formatDate(tx.created_at, lang)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          tx.type === 'purchase'
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-green-100 text-green-700 border-green-200'
                        }`}>
                          {tx.type === 'purchase' ? '↑' : '↓'} {tx.type === 'purchase' ? tr.purchase : tr.payment}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${tx.type === 'purchase' ? 'text-red-600' : 'text-green-700'}`}>
                        {tx.type === 'purchase' ? '+' : '−'}{tx.amount.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 min-w-[220px]">
                        <span className="block whitespace-normal break-words">{tx.notes ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#0f1b35]">{fmt(tx.running)}</td>
                      {profile?.role === 'manager' && (
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => deleteTx(tx)} className="text-red-400 hover:text-red-600" title={tr.delete}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteVendor}
        title={tr.delete}
        message={tr.deleteConfirmVendor}
        confirmLabel={tr.delete}
        cancelLabel={tr.cancel}
        loading={deleting}
        danger
      />
    </div>
  )
}
