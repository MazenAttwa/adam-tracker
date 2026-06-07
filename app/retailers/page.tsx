'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import type { Retailer, RetailerType, Sale } from '@/lib/types'

interface RetailerForm {
  name: string
  phone: string
  type: RetailerType
  address: string
  notes: string
}

const emptyForm: RetailerForm = {
  name: '', phone: '', type: 'retail', address: '', notes: '',
}

export default function RetailersPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [retailers, setRetailers] = useState<Retailer[]>([])
  const [sales, setSales] = useState<Pick<Sale, 'retailer_id' | 'date'>[]>([])
  const [fetching, setFetching] = useState(true)
  const [tab, setTab] = useState<'retailers' | 'aging'>('retailers')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingRetailer, setEditingRetailer] = useState<Retailer | null>(null)
  const [showDelete, setShowDelete] = useState<Retailer | null>(null)
  const [form, setForm] = useState<RetailerForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    Promise.all([fetchRetailers(), fetchSales()]).finally(() => setFetching(false))
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRetailers() {
    const { data } = await supabase.from('retailers').select('*').order('name')
    setRetailers(data ?? [])
  }

  async function fetchSales() {
    const { data } = await supabase.from('sales').select('retailer_id, date').order('date')
    setSales(data ?? [])
  }

  function set(k: keyof RetailerForm, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function openAdd() {
    setForm(emptyForm)
    setEditingRetailer(null)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(r: Retailer) {
    setForm({ name: r.name, phone: r.phone ?? '', type: r.type, address: r.address ?? '', notes: r.notes ?? '' })
    setEditingRetailer(r)
    setFormError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError(tr.required); return }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      type: form.type,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (editingRetailer) {
      const { error } = await supabase.from('retailers').update(payload).eq('id', editingRetailer.id)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('retailers').insert({ ...payload, balance: 0, created_by: profile?.id })
      if (error) { setFormError(error.message); setSaving(false); return }
    }
    setSaving(false)
    setShowForm(false)
    fetchRetailers()
  }

  async function handleDelete() {
    if (!showDelete) return
    setDeleting(true)
    await supabase.from('retailers').delete().eq('id', showDelete.id)
    setDeleting(false)
    setShowDelete(null)
    fetchRetailers()
  }

  const filtered = retailers.filter(r => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType && r.type !== filterType) return false
    return true
  })

  // Aging: retailers with balance > 0, days since oldest sale
  const agingRows = retailers
    .filter(r => r.balance > 0)
    .map(r => {
      const retailerSales = sales.filter(s => s.retailer_id === r.id)
      const oldest = retailerSales.length > 0
        ? retailerSales.reduce((min, s) => s.date < min ? s.date : min, retailerSales[0].date)
        : null
      const days = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000) : null
      return { ...r, oldestSale: oldest, days }
    })
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1))

  const totalBalance = retailers.reduce((s, r) => s + r.balance, 0)

  const TABS = [
    { key: 'retailers', label: tr.retailers },
    { key: 'aging', label: tr.agingReport },
  ] as const

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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.retailers}</h1>
            <p className="text-gray-500 text-sm mt-1">{tr.appName} · {tr.appTagline}</p>
          </div>
          <Button onClick={openAdd}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {tr.addRetailer}
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{tr.totalRetailers}</p>
            <p className="text-3xl font-bold mt-1 text-[#0f1b35]">{retailers.length}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 shadow-sm">
            <p className="text-sm text-gray-500">{tr.balance}</p>
            <p className="text-3xl font-bold mt-1 text-blue-700 tabular-nums">
              {totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100 shadow-sm">
            <p className="text-sm text-gray-500">{tr.agingTab}</p>
            <p className="text-3xl font-bold mt-1 text-amber-700">{agingRows.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-[#0f1b35] text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-[#c9a84c]/40'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Retailers tab */}
        {tab === 'retailers' && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tr.searchRetailers}
                className="sm:w-72"
              />
              <Select value={filterType} onChange={e => setFilterType(e.target.value)} className="sm:w-44">
                <option value="">{tr.allCategories}</option>
                <option value="retail">{tr.retail}</option>
                <option value="wholesale">{tr.wholesale}</option>
              </Select>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500 text-sm">{tr.noRetailers}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.retailerName}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.customerPhone}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.retailerType}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.retailerAddress}</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.balance}</th>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.createdAt}</th>
                        <th className="px-5 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-[#0f1b35]">{r.name}</td>
                          <td className="px-5 py-3.5 text-gray-500">{r.phone ?? '—'}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                              r.type === 'wholesale'
                                ? 'bg-purple-100 text-purple-700 border-purple-200'
                                : 'bg-blue-100 text-blue-700 border-blue-200'
                            }`}>
                              {r.type === 'wholesale' ? tr.wholesale : tr.retail}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-gray-500 max-w-[180px] truncate">{r.address ?? '—'}</td>
                          <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${r.balance > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                            {r.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-3.5 text-gray-400 whitespace-nowrap">{formatDate(r.created_at, lang)}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2 justify-end">
                              <button onClick={() => openEdit(r)}
                                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">
                                {tr.edit}
                              </button>
                              <button onClick={() => setShowDelete(r)}
                                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-red-500 hover:border-red-400 hover:bg-red-50 transition-colors">
                                {tr.delete}
                              </button>
                            </div>
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

        {/* Aging tab */}
        {tab === 'aging' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-[#0f1b35]">{tr.agingReport}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Retailers with outstanding balances</p>
            </div>
            {agingRows.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-500 text-sm">{tr.noOutstanding}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.retailerName}</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.retailerType}</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.balance}</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.oldestPurchase}</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.daysOutstanding}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingRows.map(r => (
                      <tr key={r.id} className={`border-b border-gray-50 ${
                        (r.days ?? 0) > 60 ? 'bg-red-50/50' : (r.days ?? 0) > 30 ? 'bg-amber-50/50' : ''
                      }`}>
                        <td className="px-5 py-3.5 font-medium text-[#0f1b35]">{r.name}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                            r.type === 'wholesale'
                              ? 'bg-purple-100 text-purple-700 border-purple-200'
                              : 'bg-blue-100 text-blue-700 border-blue-200'
                          }`}>
                            {r.type === 'wholesale' ? tr.wholesale : tr.retail}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold tabular-nums text-blue-700">
                          {r.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3.5 text-gray-500">
                          {r.oldestSale ? r.oldestSale : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {r.days !== null ? (
                            <span className={`font-bold tabular-nums ${
                              r.days > 60 ? 'text-red-600' : r.days > 30 ? 'text-amber-600' : 'text-gray-700'
                            }`}>
                              {r.days} {tr.daysOutstanding}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add/Edit modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingRetailer ? tr.editRetailer : tr.addRetailer}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>{tr.cancel}</Button>
            <Button onClick={handleSave} loading={saving}>{tr.save}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}
          <Input label={tr.retailerName} value={form.name} onChange={e => set('name', e.target.value)} required />
          <Input label={tr.customerPhone} value={form.phone} onChange={e => set('phone', e.target.value)} />
          <Select label={tr.retailerType} value={form.type} onChange={e => set('type', e.target.value as RetailerType)}>
            <option value="retail">{tr.retail}</option>
            <option value="wholesale">{tr.wholesale}</option>
          </Select>
          <Input label={tr.retailerAddress} value={form.address} onChange={e => set('address', e.target.value)} />
          <Textarea label={tr.notes} value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
        </div>
      </Modal>

      {/* Delete confirmation */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-semibold text-[#0f1b35] mb-2">{tr.delete}</h3>
            <p className="text-sm text-gray-500 mb-6">{tr.deleteConfirmRetailer}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowDelete(null)} disabled={deleting}>{tr.cancel}</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting}>{tr.delete}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
