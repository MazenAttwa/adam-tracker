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
import { formatDate, formatDateTime } from '@/lib/utils'
import type { Material, StockMovement, StockMovementType, Order } from '@/lib/types'

interface MovementForm {
  material_id: string
  type: StockMovementType
  quantity: string
  notes: string
  order_id: string
}

const emptyForm: MovementForm = {
  material_id: '', type: 'in', quantity: '', notes: '', order_id: '',
}

export default function StockPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()

  const [movements, setMovements] = useState<StockMovement[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [orders, setOrders] = useState<Pick<Order, 'id' | 'order_number'>[]>([])
  const [fetching, setFetching] = useState(true)
  const [filterMaterial, setFilterMaterial] = useState('')
  const [filterType, setFilterType] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<MovementForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role === 'customer') { router.push('/my-orders'); return }
    Promise.all([fetchMovements(), fetchMaterials(), fetchOrders()])
      .finally(() => setFetching(false))
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMovements() {
    const { data } = await supabase
      .from('stock_movements')
      .select('*, materials(id, name, code, unit), orders(order_number)')
      .order('created_at', { ascending: false })
      .limit(200)
    setMovements(data ?? [])
  }

  async function fetchMaterials() {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('name', { ascending: true })
    setMaterials(data ?? [])
  }

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('status', 'active')
      .order('order_number', { ascending: false })
      .limit(100)
    setOrders(data ?? [])
  }

  function set(k: keyof MovementForm, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function openAdd() {
    setForm(emptyForm)
    setFormError('')
    setShowForm(true)
  }

  async function handleSave() {
    setFormError('')
    if (!form.material_id) { setFormError(tr.required); return }
    const qty = parseFloat(form.quantity)
    if (!qty || qty <= 0) { setFormError(tr.required); return }
    setSaving(true)

    const material = materials.find(m => m.id === form.material_id)
    if (!material) { setSaving(false); return }

    // Insert movement
    const { error } = await supabase.from('stock_movements').insert({
      material_id: form.material_id,
      type: form.type,
      quantity: qty,
      notes: form.notes.trim() || null,
      order_id: form.order_id || null,
      created_by: profile?.id,
    })

    if (error) { setFormError(error.message); setSaving(false); return }

    // Update material quantity
    const newQty = form.type === 'in'
      ? material.current_quantity + qty
      : Math.max(0, material.current_quantity - qty)

    await supabase.from('materials')
      .update({ current_quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', form.material_id)

    setSaving(false)
    setShowForm(false)
    Promise.all([fetchMovements(), fetchMaterials()])
  }

  const filtered = movements.filter(m => {
    if (filterMaterial && m.material_id !== filterMaterial) return false
    if (filterType && m.type !== filterType) return false
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.stock}</h1>
            <p className="text-gray-500 text-sm mt-1">{tr.appName} · {tr.appTagline}</p>
          </div>
          {profile?.role === 'manager' && (
            <Button onClick={openAdd}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {tr.addMovement}
            </Button>
          )}
        </div>

        {/* Stock summary cards */}
        <div className="mb-6">
          <h2 className="font-semibold text-[#0f1b35] mb-3">{tr.stockSummary}</h2>
          {materials.length === 0 ? (
            <p className="text-sm text-gray-400">{tr.noMaterials}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {materials.map(m => {
                const isLow = m.current_quantity <= m.minimum_quantity
                return (
                  <div key={m.id} className={`rounded-xl p-4 border shadow-sm ${isLow ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
                    <p className="text-xs font-mono text-gray-400 mb-1">{m.code}</p>
                    <p className="text-sm font-medium text-[#0f1b35] leading-tight">{m.name}</p>
                    <p className={`text-xl font-bold mt-1 tabular-nums ${isLow ? 'text-red-600' : 'text-[#0f1b35]'}`}>
                      {m.current_quantity.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">
                      {m.unit === 'meter' ? tr.meter : m.unit === 'kg' ? tr.kg : tr.piece}
                      {isLow && <span className="text-red-500 ml-1">· {tr.lowStock}</span>}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Select value={filterMaterial} onChange={e => setFilterMaterial(e.target.value)} className="sm:w-56">
            <option value="">{tr.allMaterials}</option>
            {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select value={filterType} onChange={e => setFilterType(e.target.value)} className="sm:w-40">
            <option value="">{tr.allTypes}</option>
            <option value="in">{tr.in}</option>
            <option value="out">{tr.out}</option>
          </Select>
        </div>

        {/* Movements table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-[#0f1b35]">{tr.movementsHistory}</h2>
          </div>
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 text-sm">{tr.noMovements}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.createdAt}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.materialName}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.movementType}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.quantity}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.linkedOrder}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.notes}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(mv => (
                    <tr key={mv.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                        {formatDate(mv.created_at, lang)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-[#0f1b35]">{mv.materials?.name ?? '—'}</div>
                        <div className="text-xs font-mono text-gray-400">{mv.materials?.code}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          mv.type === 'in'
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-red-100 text-red-700 border-red-200'
                        }`}>
                          {mv.type === 'in' ? '↑' : '↓'} {mv.type === 'in' ? tr.in : tr.out}
                        </span>
                      </td>
                      <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${mv.type === 'in' ? 'text-green-700' : 'text-red-600'}`}>
                        {mv.type === 'in' ? '+' : '−'}{mv.quantity.toLocaleString()}
                        {mv.materials?.unit && (
                          <span className="text-xs text-gray-400 font-normal ml-1">
                            {mv.materials.unit === 'meter' ? tr.meter : mv.materials.unit === 'kg' ? tr.kg : tr.piece}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {(mv.orders as { order_number?: string } | undefined)?.order_number ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 max-w-xs">
                        <span className="truncate block">{mv.notes ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add movement modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={tr.addMovement}
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
          <Select label={tr.selectMaterial} value={form.material_id} onChange={e => set('material_id', e.target.value)}>
            <option value="">—</option>
            {materials.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.code}) — {m.current_quantity.toLocaleString()} {m.unit === 'meter' ? tr.meter : m.unit === 'kg' ? tr.kg : tr.piece}</option>
            ))}
          </Select>
          <Select label={tr.movementType} value={form.type} onChange={e => set('type', e.target.value as StockMovementType)}>
            <option value="in">{tr.stockIn}</option>
            <option value="out">{tr.stockOut}</option>
          </Select>
          <Input label={tr.quantity} type="number" min="0.01" step="0.01"
            value={form.quantity} onChange={e => set('quantity', e.target.value)} />
          <Select label={tr.selectOrder} value={form.order_id} onChange={e => set('order_id', e.target.value)}>
            <option value="">{tr.noOrder}</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
          </Select>
          <Textarea label={tr.notes} value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
        </div>
      </Modal>
    </div>
  )
}
