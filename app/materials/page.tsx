'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { useToast } from '@/contexts/ToastContext'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal, ConfirmModal } from '@/components/ui/Modal'
import { MaterialPhotoUpload } from '@/components/materials/MaterialPhotoUpload'
import { MaterialHistoryModal } from '@/components/materials/MaterialHistoryModal'
import { formatDate } from '@/lib/utils'
import type { Material, MaterialUnit, Vendor } from '@/lib/types'

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
  const { showToast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [materials, setMaterials] = useState<Material[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [fetching, setFetching] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState<MaterialForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')

  // Photo map: materialId → first file_path (for table thumbnails)
  const [photoUrlMap, setPhotoUrlMap] = useState<Record<string, string>>({})

  // Pending photo for the Add modal (uploaded after material is created)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [pendingReceipt, setPendingReceipt] = useState<File | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Reorder state
  const [reorderMaterial, setReorderMaterial] = useState<Material | null>(null)
  const [reorderQty, setReorderQty] = useState('')
  const [reorderVendorId, setReorderVendorId] = useState('')
  const [reorderAmount, setReorderAmount] = useState('')
  const [reordering, setReordering] = useState(false)
  const [reorderReceipt, setReorderReceipt] = useState<File | null>(null)
  const [reorderDate, setReorderDate] = useState('')
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [historyMaterial, setHistoryMaterial] = useState<Material | null>(null)

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    fetchMaterials()
    fetchVendors()
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMaterials() {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('name', { ascending: true })
    const list = data ?? []
    setMaterials(list)
    setFetching(false)
    const { data: mv } = await supabase
      .from('stock_movements')
      .select('material_id, type, quantity')
    const sm: Record<string, number> = {}
    for (const r of (mv ?? []) as Array<{ material_id: string; type: string; quantity: number }>) {
      sm[r.material_id] = (sm[r.material_id] ?? 0) + (r.type === 'in' ? r.quantity : -r.quantity)
    }
    setStockMap(sm)
    if (list.length > 0) {
      await fetchPhotoMap(list.map(m => m.id))
    }
  }

  async function fetchPhotoMap(ids: string[]) {
    if (!ids.length) { setPhotoUrlMap({}); return }
    const { data } = await supabase
      .from('material_photos')
      .select('material_id, file_path')
      .in('material_id', ids)
      .order('uploaded_at', { ascending: true })
    const map: Record<string, string> = {}
    for (const p of (data ?? []) as Array<{ material_id: string; file_path: string }>) {
      if (!map[p.material_id]) map[p.material_id] = p.file_path
    }
    setPhotoUrlMap(map)
  }

  function getPhotoUrl(filePath: string): string {
    const { data } = supabase.storage.from('material-photos').getPublicUrl(filePath)
    return data.publicUrl
  }

  async function fetchVendors() {
    const { data } = await supabase.from('vendors').select('*').order('name')
    setVendors(data ?? [])
  }

  function clearPendingPhoto() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
    setPendingReceipt(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    clearPendingPhoto()
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
    clearPendingPhoto()
    setShowForm(true)
  }

  function handleCloseModal() {
    setShowForm(false)
    clearPendingPhoto()
    // Refresh photo map to pick up any changes made in the edit modal
    if (materials.length > 0) {
      fetchPhotoMap(materials.map(m => m.id))
    }
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
      const { data: newMat, error } = await supabase
        .from('materials')
        .insert({ ...payload, created_by: profile?.id })
        .select()
        .single()
      if (error) { setFormError(error.message); setSaving(false); return }

      // Record initial stock as an opening 'in' movement so the ledger stays accurate
      if (newMat && payload.current_quantity > 0) {
        let initReceiptPath: string | null = null
        let initReceiptName: string | null = null
        if (pendingReceipt) {
          const rext = pendingReceipt.name.split('.').pop() ?? 'jpg'
          const rpath = `receipts/${newMat.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${rext}`
          const { error: rErr } = await supabase.storage
            .from('material-photos')
            .upload(rpath, pendingReceipt, { contentType: pendingReceipt.type })
          if (!rErr) { initReceiptPath = rpath; initReceiptName = pendingReceipt.name }
        }
        await supabase.from('stock_movements').insert({
          material_id: newMat.id,
          type: 'in',
          quantity: payload.current_quantity,
          notes: 'Initial stock',
          purchase_date: new Date().toISOString().slice(0, 10),
          total_cost: payload.cost_per_unit > 0 ? payload.cost_per_unit * payload.current_quantity : null,
          receipt_path: initReceiptPath,
          receipt_name: initReceiptName,
          created_by: profile?.id,
        })
      }

      // Upload pending photo if selected during Add flow
      if (pendingFile && newMat) {
        const ext = pendingFile.name.split('.').pop() ?? 'jpg'
        const path = `${newMat.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: storageErr } = await supabase.storage
          .from('material-photos')
          .upload(path, pendingFile, { contentType: pendingFile.type })
        if (!storageErr) {
          await supabase.from('material_photos').insert({
            material_id: newMat.id,
            file_path: path,
            file_name: pendingFile.name,
            uploaded_by: profile?.id,
          })
        }
      }
    }

    showToast(tr.savedOk)
    setSaving(false)
    setShowForm(false)
    clearPendingPhoto()
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

  function openReorder(m: Material) {
    setReorderMaterial(m)
    setReorderQty('')
    setReorderVendorId('')
    setReorderAmount('')
    setReorderReceipt(null)
    setReorderDate(new Date().toISOString().slice(0, 10))
  }

  async function handleReorder() {
    if (!reorderMaterial) return
    const qty = parseFloat(reorderQty)
    if (!qty || qty <= 0) return
    const amt = parseFloat(reorderAmount) || 0
    setReordering(true)

    let receiptPath: string | null = null
    let receiptName: string | null = null
    if (reorderReceipt) {
      const ext = reorderReceipt.name.split('.').pop() ?? 'jpg'
      const path = `receipts/${reorderMaterial.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('material-photos')
        .upload(path, reorderReceipt, { contentType: reorderReceipt.type })
      if (!upErr) { receiptPath = path; receiptName = reorderReceipt.name }
    }

    await supabase.from('stock_movements').insert({
      material_id: reorderMaterial.id,
      type: 'in',
      quantity: qty,
      notes: `Purchase: ${reorderMaterial.name}`,
      vendor_id: reorderVendorId || null,
      total_cost: amt > 0 ? amt : null,
      purchase_date: reorderDate || new Date().toISOString().slice(0, 10),
      receipt_path: receiptPath,
      receipt_name: receiptName,
      created_by: profile?.id,
    })

    await supabase.from('materials').update({
      current_quantity: reorderMaterial.current_quantity + qty,
      updated_at: new Date().toISOString(),
    }).eq('id', reorderMaterial.id)

    if (reorderVendorId && amt > 0) {
      const vendor = vendors.find(v => v.id === reorderVendorId)
      if (vendor) {
        await supabase.from('vendor_transactions').insert({
          vendor_id: reorderVendorId,
          type: 'purchase',
          amount: amt,
          notes: `Reorder: ${reorderMaterial.name} × ${qty}`,
          created_by: profile?.id,
        })
        await supabase.from('vendors').update({
          balance: vendor.balance + amt,
          updated_at: new Date().toISOString(),
        }).eq('id', reorderVendorId)
      }
    }

    setReordering(false)
    setReorderMaterial(null)
    fetchMaterials()
    fetchVendors()
    showToast(tr.savedOk)
  }

  const unitLabel = (u: MaterialUnit) =>
    u === 'meter' ? tr.meter : u === 'kg' ? tr.kg : tr.piece

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.code.toLowerCase().includes(search.toLowerCase())
  )

  const lowStockCount = materials.filter(m => (stockMap[m.id] ?? 0) <= m.minimum_quantity).length

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
                    <th className="text-left px-3 py-3 font-medium text-gray-600 w-14">{tr.photo}</th>
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
                    const isLow = (stockMap[m.id] ?? 0) <= m.minimum_quantity
                    const thumbPath = photoUrlMap[m.id]
                    const initials = m.name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    return (
                      <tr key={m.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isLow ? 'bg-red-50/40' : ''}`}>
                        <td className="px-3 py-3">
                          {thumbPath ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={getPhotoUrl(thumbPath)}
                              alt={m.name}
                              className="w-10 h-10 rounded-lg object-cover border border-gray-200"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-[#0f1b35] flex items-center justify-center text-white text-xs font-bold select-none">
                              {initials}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-[#0f1b35]">{m.name}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{m.code}</span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">{unitLabel(m.unit)}</td>
                        <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${isLow ? 'text-red-600' : 'text-[#0f1b35]'}`}>
                          {(stockMap[m.id] ?? 0).toLocaleString()}
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
                            <div className="flex items-center justify-end gap-3">
                              <button onClick={() => openReorder(m)}
                                className="text-xs text-amber-600 hover:underline font-medium">
                                {tr.buyMore}
                              </button>
                              <button onClick={() => setHistoryMaterial(m)}
                                className="text-xs text-blue-600 hover:underline font-medium">
                                {tr.history}
                              </button>
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
        onClose={handleCloseModal}
        title={editing ? tr.editMaterial : tr.addMaterial}
        footer={
          <>
            <Button variant="ghost" onClick={handleCloseModal} disabled={saving}>{tr.cancel}</Button>
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

          {/* Photo upload — full component for Edit, simple picker for Add */}
          {editing ? (
            <MaterialPhotoUpload materialId={editing.id} canEdit={profile?.role === 'manager'} />
          ) : (
            <div className="space-y-2">
              <span className="text-sm font-medium text-[#0f1b35]">{tr.materialPhotos}</span>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  clearPendingPhoto()
                  setPendingFile(file)
                  setPendingPreview(URL.createObjectURL(file))
                }}
              />
              {pendingPreview ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pendingPreview} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#0f1b35] font-medium truncate">{pendingFile?.name}</p>
                    <button
                      type="button"
                      onClick={clearPendingPhoto}
                      className="text-xs text-red-500 hover:underline mt-0.5"
                    >
                      {tr.delete}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-[#c9a84c] hover:bg-amber-50/30 transition-colors"
                >
                  <svg className="mx-auto h-7 w-7 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-xs text-gray-400">{tr.clickToUploadPhotos}</p>
                </button>
              )}
            </div>
          )}

          {!editing && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-[#0f1b35]">{tr.uploadReceipt}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setPendingReceipt(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              />
              {pendingReceipt && <p className="text-xs text-gray-500 mt-1">{pendingReceipt.name}</p>}
            </div>
          )}
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

      {/* Reorder modal */}
      <Modal
        open={!!reorderMaterial}
        onClose={() => setReorderMaterial(null)}
        title={`${tr.buyMore}: ${reorderMaterial?.name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReorderMaterial(null)} disabled={reordering}>{tr.cancel}</Button>
            <Button onClick={handleReorder} loading={reordering}>{tr.save}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={tr.quantityNeeded}
            type="number"
            min="0.01"
            step="0.01"
            value={reorderQty}
            onChange={e => setReorderQty(e.target.value)}
          />
          <Input
            label={tr.purchaseDate}
            type="date"
            value={reorderDate}
            onChange={e => setReorderDate(e.target.value)}
          />
          <Select
            label={tr.linkVendor}
            value={reorderVendorId}
            onChange={e => setReorderVendorId(e.target.value)}
          >
            <option value="">—</option>
            {vendors.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </Select>
          {reorderVendorId && (
            <Input
              label={tr.purchaseAmount}
              type="number"
              min="0"
              step="0.01"
              value={reorderAmount}
              onChange={e => setReorderAmount(e.target.value)}
            />
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tr.uploadReceipt}</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={e => setReorderReceipt(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
            />
            {reorderReceipt && <p className="text-xs text-gray-500 mt-1">{reorderReceipt.name}</p>}
          </div>
        </div>
      </Modal>

      {/* Material history modal */}
      <MaterialHistoryModal material={historyMaterial} onClose={() => setHistoryMaterial(null)} />
    </div>
  )
}
