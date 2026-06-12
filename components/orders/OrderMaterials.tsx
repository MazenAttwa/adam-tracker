'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLang } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import type { Material, OrderMaterial } from '@/lib/types'

interface OrderMaterialsProps {
  orderId: string
  canEdit: boolean
  onCostChange?: (cost: number) => void
}

function fmtCost(n: number) {
  return n.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function OrderMaterials({ orderId, canEdit, onCostChange }: OrderMaterialsProps) {
  const { tr, lang } = useLang()
  const supabase = createClient()

  const [orderMaterials, setOrderMaterials] = useState<OrderMaterial[]>([])
  const [allMaterials, setAllMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)

  // Add-form state
  const [addMode, setAddMode] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState('')
  const [qty, setQty] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  // Inline quantity-edit state (saved on blur)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [localQtys, setLocalQtys] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchData()
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    const [{ data: oms }, { data: mats }] = await Promise.all([
      supabase
        .from('order_materials')
        .select('*, materials(*)')
        .eq('order_id', orderId)
        .order('created_at'),
      supabase.from('materials').select('*').order('name'),
    ])
    setOrderMaterials(oms ?? [])
    setAllMaterials(mats ?? [])
    setLoading(false)
  }

  // ── BUG 1 FIX: plain insert (no upsert/onConflict) + surface errors ────────
  async function handleAdd() {
    setAddError('')

    if (!selectedMaterial) {
      setAddError(tr.selectMaterial)
      return
    }
    const qtyNum = parseFloat(qty)
    if (!qty || isNaN(qtyNum) || qtyNum <= 0) {
      setAddError(tr.quantityNeeded)
      return
    }

    setAdding(true)

    const { error } = await supabase.from('order_materials').insert({
      order_id: orderId,
      material_id: selectedMaterial,
      quantity_needed: qtyNum,
      is_deducted: false,
    })

    setAdding(false)

    if (error) {
      // Show the real error so it is visible and diagnosable
      setAddError(error.message)
      return
    }

    // ── BUG 2 FIX: close form, clear fields, refresh list ─────────────────
    setAddMode(false)
    setSelectedMaterial('')
    setQty('')
    await fetchData()
  }

  function openAddForm() {
    setAddMode(true)
    setSelectedMaterial('')
    setQty('')
    setAddError('')
  }

  function closeAddForm() {
    setAddMode(false)
    setSelectedMaterial('')
    setQty('')
    setAddError('')
  }

  async function handleRemove(id: string) {
    setRemovingId(id)
    await supabase.from('order_materials').delete().eq('id', id)
    setRemovingId(null)
    fetchData()
  }

  function handleQtyInput(id: string, val: string) {
    setLocalQtys(prev => ({ ...prev, [id]: val }))
  }

  async function handleQtyBlur(om: OrderMaterial, val: string) {
    const parsed = parseFloat(val)
    if (isNaN(parsed) || parsed <= 0) {
      setLocalQtys(prev => { const n = { ...prev }; delete n[om.id]; return n })
      return
    }
    if (parsed === om.quantity_needed) {
      setLocalQtys(prev => { const n = { ...prev }; delete n[om.id]; return n })
      return
    }
    await supabase.from('order_materials').update({ quantity_needed: parsed }).eq('id', om.id)
    setOrderMaterials(prev =>
      prev.map(m => m.id === om.id ? { ...m, quantity_needed: parsed } : m)
    )
    setLocalQtys(prev => { const n = { ...prev }; delete n[om.id]; return n })
  }

  function effectiveQty(om: OrderMaterial): number {
    if (localQtys[om.id] !== undefined) return parseFloat(localQtys[om.id]) || 0
    return om.quantity_needed
  }

  const unitLabel = (u: string) =>
    u === 'meter' ? tr.meter : u === 'kg' ? tr.kg : tr.piece

  // Total cost, recalculated on every render (always fresh)
  const estimatedCost = orderMaterials.reduce(
    (s, om) => s + effectiveQty(om) * (om.materials?.cost_per_unit ?? 0),
    0
  )

  useEffect(() => {
    onCostChange?.(estimatedCost)
  }, [estimatedCost]) // eslint-disable-line react-hooks/exhaustive-deps

  // Materials already linked — excluded from the dropdown
  const linkedIds = orderMaterials.map(om => om.material_id)
  const availableMaterials = allMaterials.filter(m => !linkedIds.includes(m.id))

  // Live preview — computed at render time, always in sync with state
  const selectedMat = allMaterials.find(m => m.id === selectedMaterial) ?? null
  const previewCpu = selectedMat?.cost_per_unit ?? 0
  const previewQty = parseFloat(qty) || 0
  const previewSubtotal = previewCpu * previewQty

  const currency = lang === 'ar' ? 'ج.م ' : 'EGP '

  if (loading) return null

  return (
    <div>
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[#0f1b35] text-sm">{tr.orderMaterials}</h3>
        {canEdit && !addMode && orderMaterials.length === 0 && (
          <Button size="sm" variant="secondary" onClick={openAddForm}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {tr.addOrderMaterial}
          </Button>
        )}
      </div>

      {/* Deduction info banner */}
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
        {tr.materialsDeductedMsg}
      </p>

      {/* ═══════════════════════════════════════════════════════════════
          ADD FORM — visible when addMode is true
      ═══════════════════════════════════════════════════════════════ */}
      {addMode && canEdit && (
        <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">

          {/* Validation / DB error */}
          {addError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {addError}
            </p>
          )}

          {/* Inputs row */}
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            {/* Material dropdown */}
            <Select
              label={tr.selectMaterial}
              value={selectedMaterial}
              onChange={e => { setSelectedMaterial(e.target.value); setAddError('') }}
              className="flex-1"
            >
              <option value="">—</option>
              {availableMaterials.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code}) — {m.current_quantity.toLocaleString()} {unitLabel(m.unit)}
                </option>
              ))}
            </Select>

            {/* Quantity + unit label */}
            <div className="flex items-end gap-2">
              <Input
                label={tr.quantityNeeded}
                type="number"
                min="0.01"
                step="0.01"
                value={qty}
                onChange={e => { setQty(e.target.value); setAddError('') }}
                className="w-32"
              />
              {selectedMat && (
                <span className="pb-2 text-sm text-gray-500 whitespace-nowrap">
                  {unitLabel(selectedMat.unit)}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pb-0.5">
              <Button size="sm" onClick={handleAdd} loading={adding}>
                {tr.save}
              </Button>
              <Button size="sm" variant="ghost" onClick={closeAddForm}>
                {tr.cancel}
              </Button>
            </div>
          </div>

          {/* ── Live cost preview ── shows as soon as a material is chosen */}
          {selectedMat && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{tr.costPerUnitMat}</span>
                <span className="font-semibold tabular-nums text-[#0f1b35]">
                  {currency}{fmtCost(previewCpu)} / {unitLabel(selectedMat.unit)}
                </span>
              </div>

              {previewQty > 0 && (
                <div className="flex items-center justify-between border-t border-amber-200 pt-1.5 text-sm">
                  <span className="text-amber-800">
                    {previewQty.toLocaleString()} {unitLabel(selectedMat.unit)}
                    {' × '}{currency}{fmtCost(previewCpu)}
                  </span>
                  <span className="font-bold tabular-nums text-[#c9a84c] text-base">
                    = {currency}{fmtCost(previewSubtotal)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MATERIALS LIST
      ═══════════════════════════════════════════════════════════════ */}
      {orderMaterials.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{tr.noOrderMaterials}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.materialName}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">{tr.quantityNeeded}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">{tr.costPerUnitMat}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">{tr.lineCost}</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">{tr.status}</th>
                  {canEdit && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {orderMaterials.map(om => {
                  const cpu = om.materials?.cost_per_unit ?? 0
                  const unit = om.materials?.unit ?? ''
                  const lineTotal = effectiveQty(om) * cpu

                  return (
                    <tr key={om.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">

                      {/* Material name + code */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#0f1b35]">{om.materials?.name}</div>
                        <div className="text-xs font-mono text-gray-400">{om.materials?.code}</div>
                      </td>

                      {/* Quantity — editable until deducted */}
                      <td className="px-4 py-3 text-right">
                        {!om.is_deducted && canEdit ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={localQtys[om.id] ?? om.quantity_needed.toString()}
                              onChange={e => handleQtyInput(om.id, e.target.value)}
                              onBlur={e => handleQtyBlur(om, e.target.value)}
                              className="w-20 px-2 py-1 rounded border border-gray-200 text-sm text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[#0f1b35]"
                            />
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {unit ? unitLabel(unit) : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="font-semibold tabular-nums text-[#0f1b35]">
                            {om.quantity_needed.toLocaleString()}{unit ? ` ${unitLabel(unit)}` : ''}
                          </span>
                        )}
                      </td>

                      {/* Cost per unit */}
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600 whitespace-nowrap">
                        {cpu > 0
                          ? <>{currency}{fmtCost(cpu)}{unit ? ` / ${unitLabel(unit)}` : ''}</>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>

                      {/* Subtotal — bold gold */}
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-[#c9a84c] whitespace-nowrap">
                        {lineTotal > 0
                          ? <>{currency}{fmtCost(lineTotal)}</>
                          : <span className="text-gray-300 font-normal">—</span>
                        }
                      </td>

                      {/* Deduction status */}
                      <td className="px-4 py-3">
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

                      {/* Delete */}
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          {!om.is_deducted && (
                            <button
                              onClick={() => handleRemove(om.id)}
                              disabled={removingId === om.id}
                              className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-40 transition-colors"
                            >
                              {tr.delete}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* TOTAL MATERIALS COST */}
          <div className="mt-3 flex items-center justify-between px-4 py-3 rounded-xl bg-[#0f1b35]/5 border border-[#0f1b35]/10">
            <span className="text-sm font-semibold text-[#0f1b35] uppercase tracking-wide">
              {tr.totalMaterialsCost}
            </span>
            <span className="text-lg font-bold tabular-nums text-[#c9a84c]">
              {currency}{fmtCost(estimatedCost)}
            </span>
          </div>

          {/* ── "+ Add Another Material" button — prominent, below the total ── */}
          {canEdit && !addMode && (
            <button
              onClick={openAddForm}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 hover:border-[#c9a84c] hover:text-[#c9a84c] hover:bg-amber-50/30 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {tr.addAnotherMaterial}
            </button>
          )}
        </>
      )}
    </div>
  )
}
