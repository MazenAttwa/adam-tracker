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
    } else {
      await supabase.from('manufacturers').insert({ ...payload, created_by: profile?.id })
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
            <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.manufacturers}</h1>
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
