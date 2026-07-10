'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { logAudit, diffDetails } from '@/lib/audit'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import type { Manufacturer, ManufacturerSpeciality } from '@/lib/types'

const SPECIALITIES: ManufacturerSpeciality[] = ['cutting', 'printing', 'finishing', 'all']

const SPEC_COLOR: Record<ManufacturerSpeciality, string> = {
  cutting:  'bg-purple-100 text-purple-700 border-purple-200',
  printing: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  finishing:'bg-orange-100 text-orange-700 border-orange-200',
  all:      'bg-gray-100   text-gray-700   border-gray-200',
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  address: '',
  speciality: '' as ManufacturerSpeciality | '',
  notes: '',
}

interface MfrWork { orderId: string; orderNumber: string; stage: string; qty: number; cost: number; date: string }
interface MfrPayment { id: string; manufacturer_id: string; amount: number; date: string; notes: string | null }

export default function ManufacturersPage() {
  const { profile, loading } = useAuth()
  const { tr } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState('')
  const [specFilter, setSpecFilter] = useState<ManufacturerSpeciality | 'all'>('all')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Manufacturer | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Manufacturer | null>(null)
  const [costsByName, setCostsByName] = useState<Record<string, MfrWork[]>>({})
  const [payments, setPayments] = useState<MfrPayment[]>([])
  const [detailMfr, setDetailMfr] = useState<Manufacturer | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '' })
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    fetchManufacturers()
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchManufacturers() {
    const { data } = await supabase
      .from('manufacturers')
      .select('*')
      .order('name')
    setManufacturers((data ?? []) as Manufacturer[])
    setFetching(false)
    fetchAccounts()
  }

  async function fetchAccounts() {
    const [{ data: ordersD }, { data: sdD }, { data: paysD }] = await Promise.all([
      supabase.from('orders').select('id, order_number, created_at'),
      supabase.from('stage_data').select('order_id, stage, data'),
      supabase.from('manufacturer_payments').select('*'),
    ])
    const orderMap = new Map<string, { order_number: string; created_at: string }>()
    ;((ordersD ?? []) as { id: string; order_number: string; created_at: string }[]).forEach(o => orderMap.set(o.id, { order_number: o.order_number, created_at: o.created_at }))
    const byName: Record<string, MfrWork[]> = {}
    const add = (name: string, w: MfrWork) => {
      const key = name.toLowerCase().trim()
      if (!key) return
      ;(byName[key] = byName[key] ?? []).push(w)
    }
    ;((sdD ?? []) as { order_id: string; stage: string; data: Record<string, unknown> }[]).forEach(r => {
      const o = orderMap.get(r.order_id)
      const on = o?.order_number ?? '?'
      const date = (o?.created_at ?? '').slice(0, 10)
      const d = r.data ?? {}
      if (r.stage === 'cutting' || r.stage === 'printing') {
        const name = typeof d['manufacturer_name'] === 'string' ? (d['manufacturer_name'] as string) : ''
        const cost = r.stage === 'cutting' ? Number(d['total_cutting_cost'] ?? 0) : Number(d['total_printing_cost'] ?? 0)
        const qty = r.stage === 'cutting' ? Number(d['quantity_to_cut'] ?? 0) : Number(d['quantity_to_print'] ?? 0)
        if (name && cost > 0) add(name, { orderId: r.order_id, orderNumber: on, stage: r.stage, qty, cost, date })
      }
      if (r.stage === 'finishing' && Array.isArray(d['manufacturers'])) {
        ;(d['manufacturers'] as { manufacturer_name?: string; quantity?: number; subtotal?: number }[]).forEach(m => {
          if (m.manufacturer_name && (m.subtotal ?? 0) > 0) add(m.manufacturer_name, { orderId: r.order_id, orderNumber: on, stage: 'finishing', qty: m.quantity ?? 0, cost: m.subtotal ?? 0, date })
        })
      }
    })
    setCostsByName(byName)
    setPayments((paysD ?? []) as MfrPayment[])
  }

  function accountFor(m: Manufacturer) {
    const works = (costsByName[m.name.toLowerCase().trim()] ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1))
    const owed = works.reduce((s, w) => s + w.cost, 0)
    const mPays = payments.filter(p => p.manufacturer_id === m.id).slice().sort((a, b) => (a.date < b.date ? 1 : -1))
    const paid = mPays.reduce((s, p) => s + p.amount, 0)
    return { works, owed, mPays, paid, remaining: owed - paid }
  }

  function openDetail(m: Manufacturer) {
    setDetailMfr(m)
    setPayForm({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '' })
    setPayError('')
  }

  async function savePayment() {
    if (!detailMfr) return
    setPayError('')
    const amt = parseFloat(payForm.amount)
    if (!amt || amt <= 0) { setPayError(tr.required); return }
    setPaySaving(true)
    const { error } = await supabase.from('manufacturer_payments').insert({
      manufacturer_id: detailMfr.id, amount: amt, date: payForm.date,
      notes: payForm.notes.trim() || null, created_by: profile?.id,
    })
    if (error) { setPayError(error.message); setPaySaving(false); return }
    logAudit({ id: profile?.id, email: profile?.email }, 'buy', 'manufacturer', detailMfr.name, 'Paid ' + amt.toFixed(2) + ' to "' + detailMfr.name + '"')
    setPayForm({ amount: '', date: new Date().toISOString().slice(0, 10), notes: '' })
    setPaySaving(false)
    fetchAccounts()
  }

  function setF(key: string, val: string) {
    setForm(p => ({ ...p, [key]: val }))
  }

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setShowForm(true)
  }

  function openEdit(m: Manufacturer) {
    setEditing(m)
    setForm({
      name: m.name,
      phone: m.phone ?? '',
      address: m.address ?? '',
      speciality: m.speciality ?? '',
      notes: m.notes ?? '',
    })
    setFormError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError(tr.required); return }
    setSaving(true)
    setFormError('')

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      speciality: (form.speciality as ManufacturerSpeciality) || null,
      notes: form.notes.trim() || null,
    }

    if (editing) {
      await supabase.from('manufacturers').update(payload).eq('id', editing.id)
      logAudit({ id: profile?.id, email: profile?.email }, 'edit', 'manufacturer', payload.name, diffDetails(
        { name: editing.name, phone: editing.phone ?? '', address: editing.address ?? '', speciality: editing.speciality ?? '', notes: editing.notes ?? '' },
        payload, { name: 'Name', phone: 'Phone', address: 'Address', speciality: 'Speciality', notes: 'Notes' },
      ) || (payload.name + ' (no changes)'))
    } else {
      await supabase.from('manufacturers').insert({ ...payload, created_by: profile?.id })
      logAudit({ id: profile?.id, email: profile?.email }, 'create', 'manufacturer', payload.name, 'Created manufacturer "' + payload.name + '"')
    }

    setSaving(false)
    setShowForm(false)
    fetchManufacturers()
  }

  function openDelete(m: Manufacturer) {
    setDeleteTarget(m)
    setShowDelete(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('manufacturers').delete().eq('id', deleteTarget.id)
    logAudit({ id: profile?.id, email: profile?.email }, 'delete', 'manufacturer', deleteTarget.name, 'Deleted manufacturer "' + deleteTarget.name + '"')
    setDeleting(false)
    setShowDelete(false)
    setDeleteTarget(null)
    fetchManufacturers()
  }

  const specLabel = (s: ManufacturerSpeciality): string => ({
    cutting: tr.specialityCutting,
    printing: tr.specialityPrinting,
    finishing: tr.specialityFinishing,
    all: tr.specialityAll,
  }[s])

  const filtered = manufacturers.filter(m => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    if (specFilter !== 'all' && m.speciality !== specFilter) return false
    return true
  })

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
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0f1b35] flex items-center gap-2.5"><span className="w-1.5 h-7 bg-[#c9a84c] rounded-full" />{tr.manufacturers}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {filtered.length} {tr.totalManufacturers.toLowerCase()}
            </p>
          </div>
          {profile?.role === 'manager' && (
            <Button onClick={openAdd}>+ {tr.addManufacturer}</Button>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-col sm:flex-row gap-3">
          <input
            type="search"
            placeholder={tr.searchManufacturers}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm
                       focus:outline-none focus:ring-2 focus:ring-[#0f1b35]"
          />
          <select
            value={specFilter}
            onChange={e => setSpecFilter(e.target.value as ManufacturerSpeciality | 'all')}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm
                       focus:outline-none focus:ring-2 focus:ring-[#0f1b35] bg-white"
          >
            <option value="all">{tr.allSpecialities}</option>
            {SPECIALITIES.map(s => (
              <option key={s} value={s}>{specLabel(s)}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <p className="text-gray-500 text-sm">{tr.noManufacturers}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(m => (
              <div key={m.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:border-[#c9a84c]/40 transition-all">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[#0f1b35] truncate">{m.name}</h3>
                    {m.phone && (
                      <p className="text-xs text-gray-500 mt-0.5">📞 {m.phone}</p>
                    )}
                    {m.address && (
                      <p className="text-xs text-gray-500 truncate">📍 {m.address}</p>
                    )}
                  </div>
                  {m.speciality && (
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${SPEC_COLOR[m.speciality]}`}>
                      {specLabel(m.speciality)}
                    </span>
                  )}
                </div>

                {m.notes && (
                  <p className="text-xs text-gray-400 mb-3 line-clamp-2">{m.notes}</p>
                )}

                {(() => {
                  const a = accountFor(m)
                  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  return (
                    <div className="mb-3 rounded-lg bg-gray-50 border border-gray-100 p-2.5 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-gray-500">{tr.totalOwed}</span><span className="font-semibold text-[#0f1b35] tabular-nums">{fmt(a.owed)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{tr.totalPaid}</span><span className="font-semibold text-green-700 tabular-nums">{fmt(a.paid)}</span></div>
                      <div className="flex justify-between border-t border-gray-200 pt-1"><span className="text-gray-500">{tr.remaining}</span><span className={`font-bold tabular-nums ${a.remaining > 0.005 ? 'text-red-600' : 'text-green-700'}`}>{fmt(a.remaining)}</span></div>
                      <button onClick={() => openDetail(m)} className="w-full mt-1 text-center text-[#c9a84c] font-medium hover:underline">{tr.viewAccount} →</button>
                    </div>
                  )
                })()}

                {profile?.role === 'manager' && (
                  <div className="flex gap-2 pt-3 border-t border-gray-50">
                    <button
                      onClick={() => openEdit(m)}
                      className="flex-1 text-xs font-medium text-[#0f1b35] hover:text-[#c9a84c] transition-colors text-center py-1"
                    >
                      {tr.edit}
                    </button>
                    <button
                      onClick={() => openDelete(m)}
                      className="flex-1 text-xs font-medium text-red-500 hover:text-red-700 transition-colors text-center py-1"
                    >
                      {tr.delete}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add / Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? tr.editManufacturer : tr.addManufacturer}
      >
        <div className="space-y-4">
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
          <Input
            label={tr.manufacturerName + ' *'}
            value={form.name}
            onChange={e => setF('name', e.target.value)}
          />
          <Input
            label={tr.manufacturerPhone}
            value={form.phone}
            onChange={e => setF('phone', e.target.value)}
          />
          <Input
            label={tr.manufacturerAddress}
            value={form.address}
            onChange={e => setF('address', e.target.value)}
          />
          <Select
            label={tr.manufacturerSpeciality}
            value={form.speciality}
            onChange={e => setF('speciality', e.target.value)}
          >
            <option value="">{tr.allSpecialities}</option>
            {SPECIALITIES.map(s => (
              <option key={s} value={s}>{specLabel(s)}</option>
            ))}
          </Select>
          <Textarea
            label={tr.manufacturerNotes}
            value={form.notes}
            onChange={e => setF('notes', e.target.value)}
          />
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleSave} loading={saving}>
              {tr.save}
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => setShowForm(false)}>
              {tr.cancel}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manufacturer Account Detail */}
      <Modal open={!!detailMfr} onClose={() => setDetailMfr(null)} title={detailMfr ? detailMfr.name + ' \u2014 ' + tr.manufacturerAccount : ''}>
        {detailMfr && (() => {
          const a = accountFor(detailMfr)
          const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
                  <p className="text-[11px] text-gray-500">{tr.totalOwed}</p>
                  <p className="text-base font-bold text-[#0f1b35] tabular-nums">{fmt(a.owed)}</p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-100 p-3 text-center">
                  <p className="text-[11px] text-gray-500">{tr.totalPaid}</p>
                  <p className="text-base font-bold text-green-700 tabular-nums">{fmt(a.paid)}</p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${a.remaining > 0.005 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                  <p className="text-[11px] text-gray-500">{tr.remaining}</p>
                  <p className={`text-base font-bold tabular-nums ${a.remaining > 0.005 ? 'text-red-600' : 'text-green-700'}`}>{fmt(a.remaining)}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#0f1b35] mb-2">{tr.workDone}</h3>
                <div className="rounded-lg border border-gray-100 overflow-x-auto max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">{tr.orders}</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">{tr.stage}</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">{tr.quantity}</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500">{tr.cost}</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">{tr.date}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.works.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">—</td></tr>
                      )}
                      {a.works.map((w, i) => (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="px-3 py-2 font-medium text-[#0f1b35]">{w.orderNumber}</td>
                          <td className="px-3 py-2 text-gray-600 capitalize">{w.stage}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{w.qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(w.cost)}</td>
                          <td className="px-3 py-2 text-gray-500">{w.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#0f1b35] mb-2">{tr.paymentHistory}</h3>
                {a.mPays.length === 0 ? (
                  <p className="text-xs text-gray-400">{tr.noPayments}</p>
                ) : (
                  <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-40 overflow-y-auto">
                    {a.mPays.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div>
                          <span className="font-medium text-green-700 tabular-nums">{fmt(p.amount)}</span>
                          {p.notes && <span className="text-gray-400 ml-2">{p.notes}</span>}
                        </div>
                        <span className="text-gray-500">{p.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {profile?.role === 'manager' && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
                  <h3 className="text-sm font-semibold text-[#0f1b35]">{tr.recordPayment}</h3>
                  {payError && <p className="text-xs text-red-600">{payError}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <Input label={tr.paidAmount} type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} />
                    <Input label={tr.paymentDate} type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <Input label={tr.manufacturerNotes} value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} />
                  <Button onClick={savePayment} loading={paySaving} className="w-full">{tr.recordPayment}</Button>
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* Delete Modal */}
      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={tr.delete}
        message={tr.deleteConfirmManufacturer}
        confirmLabel={tr.delete}
        cancelLabel={tr.cancel}
        loading={deleting}
        danger
      />
    </div>
  )
}
