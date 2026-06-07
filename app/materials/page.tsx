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
import type { Material, MaterialUnit } from '@/lib/types'

const UNITS: MaterialUnit[] = ['meter', 'kg', 'piece']

interface MaterialForm {
  name: string
  code: string
  unit: MaterialUnit
  current_quantity: string
  minimum_quantity: string
  cost_per_unit: string
  notes: string
}

const emptyForm: MaterialForm = {
  name: '', code: '', unit: 'piece',
  current_quantity: '0', minimum_quantity: '0', cost_per_unit: '0', notes: '',
}

export default function MaterialsPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [materials, setMaterials] = useState<Material[]>([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState<MaterialForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    fetchMaterials()
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMaterials() {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('name', { ascending: true })
    setMaterials(data ?? [])
    setFetching(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(m: Material) {
    setEditing(m)
    setForm({
      name: m.name,
      code: m.code,
      unit: m.unit,
      current_quantity: String(m.current_quantity),
      minimum_quantity: String(m.minimum_quantity),
      cost_per_unit: String(m.cost_per_unit),
      notes: m.notes ?? '',
    })
    setFormError('')
    setShowForm(true)
  }

  function set(k: keyof MaterialForm, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  async function handleSave() {
    setFormError('')
    if (!form.name.trim()) { setFormError(tr.required); return }
    if (!form.code.trim()) { setFormError(tr.required); return }
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      unit: form.unit,
      current_quantity: parseFloat(form.current_quantity) || 0,
      minimum_quantity: parseFloat(form.minimum_quantity) || 0,
      cost_per_unit: parseFloat(form.cost_per_unit) || 0,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (editing) {
      const { error } = await supabase.from('materials').update(payload).eq('id', editing.id)
      if (error) { setFormError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('materials').insert({ ...payload, created_by: profile?.id })
      if (error) { setFormError(error.message); setSaving(false); return }
    }

    setSaving(false)
    setShowForm(false)
    fetchMaterials()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    await supabase.from('materials').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    setDeleteTarget(null)
    fetchMaterials()
  }

  const unitLabel = (u: MaterialUnit) =>
    u === 'meter' ? tr.meter : u === 'kg' ? tr.kg : tr.piece

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.code.toLowerCase().includes(search.toLowerCase())
  )

  const lowStockCount = materials.filter(m => m.current_quantity <= m.minimum_quantity).length

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
            <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.materials}</h1>
            <p className="text-gray-500 text-sm mt-1">{tr.appName} · {tr.appTagline}</p>
          </div>
          {profile?.role === 'manager' && (
            <Button onClick={openAdd}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {tr.addMaterial}
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-500">{tr.totalMaterials}</p>
            <p className="text-3xl font-bold mt-1 text-[#0f1b35]">{materials.length}</p>
          </div>
          <div className={`rounded-xl p-5 border shadow-sm ${lowStockCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
            <p className="text-sm text-gray-500">{tr.lowStockCount}</p>
            <p className={`text-3xl font-bold mt-1 ${lowStockCount > 0 ? 'text-red-600' : 'text-[#0f1b35]'}`}>{lowStockCount}</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder={tr.searchMaterials}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">{tr.noMaterials}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.materialName}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.materialCode}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.unit}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.currentQuantity}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.minimumQuantity}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.costPerUnit}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.status}</th>
                    {profile?.role === 'manager' && (
                      <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.actions}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => {
                    const isLow = m.current_quantity <= m.minimum_quantity
                    return (
                      <tr key={m.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isLow ? 'bg-red-50/40' : ''}`}>
                        <td className="px-5 py-3.5 font-medium text-[#0f1b35]">{m.name}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{m.code}</span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">{unitLabel(m.unit)}</td>
                        <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${isLow ? 'text-red-600' : 'text-[#0f1b35]'}`}>
                          {m.current_quantity.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-right text-gray-500 tabular-nums">
                          {m.minimum_quantity.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-right text-gray-600 tabular-nums">
                          {m.cost_per_unit.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3.5">
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                              {tr.lowStock}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                              OK
                            </span>
                          )}
                        </td>
                        {profile?.role === 'manager' && (
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => openEdit(m)}
                                className="text-xs text-[#0f1b35] hover:underline font-medium">
                                {tr.edit}
                              </button>
                              <button onClick={() => setDeleteTarget(m)}
                                className="text-xs text-red-500 hover:underline font-medium">
                                {tr.delete}
                              </button>
                            </div>
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
      </main>

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? tr.editMaterial : tr.addMaterial}
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
          <div className="grid grid-cols-2 gap-4">
            <Input label={tr.materialName} value={form.name} onChange={e => set('name', e.target.value)} className="col-span-2" />
            <Input label={tr.materialCode} value={form.code} onChange={e => set('code', e.target.value)} />
            <Select label={tr.unit} value={form.unit} onChange={e => set('unit', e.target.value as MaterialUnit)}>
              {UNITS.map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
            </Select>
            <Input label={tr.currentQuantity} type="number" min="0" step="0.01"
              value={form.current_quantity} onChange={e => set('current_quantity', e.target.value)} />
            <Input label={tr.minimumQuantity} type="number" min="0" step="0.01"
              value={form.minimum_quantity} onChange={e => set('minimum_quantity', e.target.value)} />
            <Input label={tr.costPerUnit} type="number" min="0" step="0.01" className="col-span-2"
              value={form.cost_per_unit} onChange={e => set('cost_per_unit', e.target.value)} />
          </div>
          <Textarea label={tr.materialNotes} value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={tr.delete}
        message={tr.deleteConfirmMaterial}
        confirmLabel={tr.delete}
        cancelLabel={tr.cancel}
        loading={deleting}
        danger
      />
    </div>
  )
}
