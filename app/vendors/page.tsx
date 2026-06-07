'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
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

export default function VendorsPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<'vendors' | 'aging'>('vendors')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [transactions, setTransactions] = useState<VendorTransaction[]>([])
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
    const [{ data: v }, { data: tx }] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      supabase.from('vendor_transactions').select('*').order('created_at', { ascending: false }),
    ])
    setVendors(v ?? [])
    setTransactions(tx ?? [])
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
    } else {
      const { error } = await supabase.from('vendors').insert({ ...payload, created_by: profile?.id })
      if (error) { setVendorError(error.message); setVendorSaving(false); return }
    }
    setVendorSaving(false)
    setShowVendorForm(false)
    fetchAll()
  }

  async function handleDeleteVendor() {
    if (!deleteTarget) return
    setDeleting(true)
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
            <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.vendors}</h1>
            <p className="text-gray-500 text-sm mt-1">{tr.appName} · {tr.appTagline}</p>
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
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{tr.totalVendors}</p>
            <p className="text-3xl font-bold mt-1 text-[#0f1b35]">{vendors.length}</p>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm ${totalOwed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
            <p className="text-sm text-gray-500">{tr.totalOutstanding}</p>
            <p className={`text-3xl font-bold mt-1 tabular-nums ${totalOwed > 0 ? 'text-amber-700' : 'text-[#0f1b35]'}`}>
              {totalOwed.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2 })}
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
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.balance}</th>
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
                          <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${v.balance > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                            {v.balance > 0
                              ? v.balance.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2 })
                              : '—'}
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
          {/* Balance summary */}
          {txVendor && (
            <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${txVendor.balance > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
              <span className="text-sm font-medium text-gray-700">{tr.balance}</span>
              <span className={`text-lg font-bold tabular-nums ${txVendor.balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {txVendor.balance.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2 })}
              </span>
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

          {/* Transaction history */}
          {vendorTxs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{tr.noTransactions}</p>
          ) : (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.createdAt}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.transactionType}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">{tr.amount}</th>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.notes}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorTxs.map(tx => (
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
                      <td className="px-4 py-2.5 text-gray-500 max-w-[160px]">
                        <span className="truncate block">{tx.notes ?? '—'}</span>
                      </td>
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
