'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import type { Material, OrderMaterial } from '@/lib/types'

interface OrderMaterialsProps {
  orderId: string
  canEdit: boolean
}

export function OrderMaterials({ orderId, canEdit }: OrderMaterialsProps) {
  const { profile } = useAuth()
  const { tr } = useLang()
  const supabase = createClient()

  const [orderMaterials, setOrderMaterials] = useState<OrderMaterial[]>([])
  const [allMaterials, setAllMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [addMode, setAddMode] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [qty, setQty] = useState('')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    const [{ data: oms }, { data: mats }] = await Promise.all([
      supabase.from('order_materials').select('*, materials(*)').eq('order_id', orderId).order('created_at'),
      supabase.from('materials').select('*').order('name'),
    ])
    setOrderMaterials(oms ?? [])
    setAllMaterials(mats ?? [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!selectedMaterial || !qty || parseFloat(qty) <= 0) return
    setAdding(true)

    const { error } = await supabase.from('order_materials').upsert({
      order_id: orderId,
      material_id: selectedMaterial,
      quantity_needed: parseFloat(qty),
      is_deducted: false,
    }, { onConflict: 'order_id,material_id' })

    if (!error) {
      setAddMode(false)
      setSelectedMaterial('')
      setQty('')
      fetchData()
    }
    setAdding(false)
  }

  async function handleRemove(id: string) {
    setRemovingId(id)
    await supabase.from('order_materials').delete().eq('id', id)
    setRemovingId(null)
    fetchData()
  }

  const unitLabel = (u: string) =>
    u === 'meter' ? tr.meter : u === 'kg' ? tr.kg : tr.piece

  const estimatedCost = orderMaterials.reduce(
    (s, om) => s + om.quantity_needed * (om.materials?.cost_per_unit ?? 0),
    0
  )

  const linkedIds = orderMaterials.map(om => om.material_id)
  const availableMaterials = allMaterials.filter(m => !linkedIds.includes(m.id))

  if (loading) return null

  return (
    <div className="border-t border-gray-100 pt-6 mt-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[#0f1b35] text-sm">{tr.orderMaterials}</h3>
        {canEdit && !addMode && (
          <Button size="sm" variant="secondary" onClick={() => setAddMode(true)}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {tr.addOrderMaterial}
          </Button>
        )}
      </div>

      {/* Info banner */}
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
        {tr.materialsDeductedMsg}
      </p>

      {/* Add row */}
      {addMode && canEdit && (
        <div className="flex flex-col sm:flex-row gap-3 items-end mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <Select
            label={tr.selectMaterial}
            value={selectedMaterial}
            onChange={e => setSelectedMaterial(e.target.value)}
            className="flex-1"
          >
            <option value="">—</option>
            {availableMaterials.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code}) — {m.current_quantity.toLocaleString()} {unitLabel(m.unit)}
              </option>
            ))}
          </Select>
          <Input
            label={tr.quantityNeeded}
            type="number"
            min="0.01"
            step="0.01"
            value={qty}
            onChange={e => setQty(e.target.value)}
            className="sm:w-36"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} loading={adding}>{tr.save}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddMode(false); setSelectedMaterial(''); setQty('') }}>
              {tr.cancel}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {orderMaterials.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{tr.noOrderMaterials}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.materialName}</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.unit}</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">{tr.quantityNeeded}</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.status}</th>
                {canEdit && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {orderMaterials.map(om => (
                <tr key={om.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[#0f1b35]">{om.materials?.name}</div>
                    <div className="text-xs font-mono text-gray-400">{om.materials?.code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {om.materials?.unit ? unitLabel(om.materials.unit) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[#0f1b35]">
                    {om.quantity_needed.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    {om.is_deducted ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">
                        ✓ {tr.deducted}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                        ⏳ {tr.pendingDeduction}
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      {!om.is_deducted && (
                        <button
                          onClick={() => handleRemove(om.id)}
                          disabled={removingId === om.id}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          {tr.delete}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Estimated cost footer */}
      {orderMaterials.length > 0 && estimatedCost > 0 && (
        <div className="mt-3 flex items-center justify-between px-4 py-2.5 bg-[#0f1b35]/5 rounded-xl border border-[#0f1b35]/10">
          <span className="text-sm font-medium text-[#0f1b35]">{tr.estimatedCost}</span>
          <span className="text-sm font-bold tabular-nums text-[#0f1b35]">
            {estimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  )
}
