'use client'
import { useState, useEffect } from 'react'
import { useLang } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { Input, Textarea, Select, Checkbox } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PhotoUpload } from '@/components/orders/PhotoUpload'
import { ManufacturerSelect } from '@/components/orders/ManufacturerSelect'
import { formatDateTime } from '@/lib/utils'
import type { Stage, StageData, FinishingManufacturerRow } from '@/lib/types'

interface StageFormProps {
  orderId: string
  stage: Stage
  stageData: StageData | null
  canEdit: boolean
  onSaved?: () => void
}

function fmt(n: number) {
  return n.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function StageForm({ orderId, stage, stageData, canEdit, onSaved }: StageFormProps) {
  const { tr, lang } = useLang()
  const { profile } = useAuth()
  const supabase = createClient()
  const [formData, setFormData] = useState<Record<string, unknown>>(stageData?.data ?? {})
  const [notes, setNotes] = useState(stageData?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setFormData(stageData?.data ?? {})
    setNotes(stageData?.notes ?? '')
  }, [stageData])

  function set(key: string, val: unknown) {
    setFormData(p => ({ ...p, [key]: val }))
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('stage_data').upsert({
      order_id: orderId,
      stage,
      data: formData,
      notes: notes || null,
      updated_by: profile?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_id,stage' })
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved?.()
    }
  }

  const d = formData as Record<string, unknown>

  // ── Helpers ────────────────────────────────────────────────────────────────

  function num(key: string): number {
    const v = d[key]
    return typeof v === 'number' ? v : 0
  }
  function str(key: string): string {
    return String(d[key] ?? '')
  }
  function bool(key: string): boolean {
    return Boolean(d[key])
  }

  // ── Finishing manufacturers sub-form ───────────────────────────────────────

  const manufacturers: FinishingManufacturerRow[] =
    Array.isArray(d.manufacturers) ? (d.manufacturers as FinishingManufacturerRow[]) : []

  function setManufacturers(rows: FinishingManufacturerRow[]) {
    const grand = rows.reduce((s, r) => s + (r.subtotal ?? 0), 0)
    setFormData(p => ({ ...p, manufacturers: rows, grand_total_finishing_cost: grand }))
  }

  function addManufacturerRow() {
    setManufacturers([...manufacturers, { manufacturer_name: '', quantity: 0, cost_per_unit: 0, subtotal: 0 }])
  }

  function updateManufacturerRow(i: number, patch: Partial<FinishingManufacturerRow>) {
    const rows = manufacturers.map((r, idx) => {
      if (idx !== i) return r
      const updated = { ...r, ...patch }
      updated.subtotal = (updated.quantity ?? 0) * (updated.cost_per_unit ?? 0)
      return updated
    })
    setManufacturers(rows)
  }

  function removeManufacturerRow(i: number) {
    setManufacturers(manufacturers.filter((_, idx) => idx !== i))
  }

  const grandTotal = num('grand_total_finishing_cost')

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── DRAFT ─────────────────────────────────────────────────────────── */}
      {stage === 'draft' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Textarea label={tr.fabricDescription} disabled={!canEdit}
              value={str('fabric_description')}
              onChange={e => set('fabric_description', e.target.value)} />
            <Input label={tr.quantity} type="number" disabled={!canEdit}
              value={str('quantity')}
              onChange={e => set('quantity', e.target.value ? Number(e.target.value) : '')} />
            <Textarea label={tr.sizeDetails} disabled={!canEdit}
              value={str('size_details')}
              onChange={e => set('size_details', e.target.value)} />
            <Input label={tr.deadline} type="date" disabled={!canEdit}
              value={str('deadline')}
              onChange={e => set('deadline', e.target.value)} />
            <Textarea label={tr.designNotes} disabled={!canEdit} className="sm:col-span-2"
              value={str('design_notes')}
              onChange={e => set('design_notes', e.target.value)} />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <PhotoUpload orderId={orderId} canEdit={canEdit} />
          </div>
        </>
      )}

      {/* ── PREPARATION ───────────────────────────────────────────────────── */}
      {stage === 'preparation' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Textarea label={tr.materialsList} disabled={!canEdit} className="sm:col-span-2"
            value={str('materials_list')}
            onChange={e => set('materials_list', e.target.value)} />
          <Input label={tr.fabricColor} disabled={!canEdit}
            value={str('fabric_color')}
            onChange={e => set('fabric_color', e.target.value)} />
          <Input label={tr.fabricQuantity} type="number" disabled={!canEdit}
            value={str('fabric_quantity')}
            onChange={e => set('fabric_quantity', e.target.value ? Number(e.target.value) : '')} />
          <Input label={tr.supplierName} disabled={!canEdit}
            value={str('supplier_name')}
            onChange={e => set('supplier_name', e.target.value)} />
          <Input label={tr.estimatedCost} type="number" disabled={!canEdit}
            value={str('estimated_cost')}
            onChange={e => set('estimated_cost', e.target.value ? Number(e.target.value) : '')} />
        </div>
      )}

      {/* ── CUTTING ───────────────────────────────────────────────────────── */}
      {stage === 'cutting' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={tr.cuttingCostPerUnit} type="number" disabled={!canEdit}
            value={str('cutting_cost_per_unit')}
            onChange={e => {
              const cpu = e.target.value ? Number(e.target.value) : 0
              const qty = num('quantity_to_cut')
              set('cutting_cost_per_unit', cpu)
              set('total_cutting_cost', cpu * qty)
            }} />
          <Input label={tr.quantityToCut} type="number" disabled={!canEdit}
            value={str('quantity_to_cut')}
            onChange={e => {
              const qty = e.target.value ? Number(e.target.value) : 0
              const cpu = num('cutting_cost_per_unit')
              set('quantity_to_cut', qty)
              set('total_cutting_cost', cpu * qty)
            }} />

          {/* Auto-calculated total */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {tr.totalCuttingCost}
            </label>
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm font-bold text-[#0f1b35] tabular-nums">
              {lang === 'ar' ? 'ج.م ' : 'EGP '}
              {fmt(num('total_cutting_cost'))}
            </div>
          </div>

          {/* Manufacturer */}
          <div className="sm:col-span-2">
            <ManufacturerSelect
              label={tr.manufacturer}
              value={str('manufacturer_name')}
              onChange={(name, id) => { set('manufacturer_name', name); set('manufacturer_id', id ?? '') }}
              disabled={!canEdit}
              filterSpeciality="cutting"
            />
          </div>

          <Textarea label={tr.cuttingNotes} disabled={!canEdit} className="sm:col-span-2"
            value={str('cutting_notes')}
            onChange={e => set('cutting_notes', e.target.value)} />
        </div>
      )}

      {/* ── PRINTING ──────────────────────────────────────────────────────── */}
      {stage === 'printing' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={tr.printingCostPerUnit} type="number" disabled={!canEdit}
            value={str('printing_cost_per_unit')}
            onChange={e => {
              const cpu = e.target.value ? Number(e.target.value) : 0
              const qty = num('quantity_to_print')
              set('printing_cost_per_unit', cpu)
              set('total_printing_cost', cpu * qty)
            }} />
          <Input label={tr.quantityToPrint} type="number" disabled={!canEdit}
            value={str('quantity_to_print')}
            onChange={e => {
              const qty = e.target.value ? Number(e.target.value) : 0
              const cpu = num('printing_cost_per_unit')
              set('quantity_to_print', qty)
              set('total_printing_cost', cpu * qty)
            }} />

          {/* Auto-calculated total */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {tr.totalPrintingCost}
            </label>
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm font-bold text-[#0f1b35] tabular-nums">
              {lang === 'ar' ? 'ج.م ' : 'EGP '}
              {fmt(num('total_printing_cost'))}
            </div>
          </div>

          {/* Manufacturer */}
          <div className="sm:col-span-2">
            <ManufacturerSelect
              label={tr.manufacturer}
              value={str('manufacturer_name')}
              onChange={(name, id) => { set('manufacturer_name', name); set('manufacturer_id', id ?? '') }}
              disabled={!canEdit}
              filterSpeciality="printing"
            />
          </div>

          <Input label={tr.printingLocation} disabled={!canEdit}
            value={str('printing_location')}
            onChange={e => set('printing_location', e.target.value)} />

          <Textarea label={tr.printingNotes} disabled={!canEdit} className="sm:col-span-2"
            value={str('printing_notes')}
            onChange={e => set('printing_notes', e.target.value)} />
        </div>
      )}

      {/* ── FINISHING ─────────────────────────────────────────────────────── */}
      {stage === 'finishing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label={tr.finishingType} disabled={!canEdit}
              value={str('finishing_type') || 'machine'}
              onChange={e => set('finishing_type', e.target.value)}>
              <option value="machine">{tr.finishingTypes.machine}</option>
              <option value="hand">{tr.finishingTypes.hand}</option>
            </Select>
            <Input label={tr.finishingWorker} disabled={!canEdit}
              value={str('finishing_worker')}
              onChange={e => set('finishing_worker', e.target.value)} />
            <Input label={tr.packagingType} disabled={!canEdit}
              value={str('packaging_type')}
              onChange={e => set('packaging_type', e.target.value)} />
            <div className="flex flex-col gap-3 pt-1">
              <Checkbox label={tr.ironing} disabled={!canEdit}
                checked={bool('ironing')}
                onChange={e => set('ironing', e.target.checked)} />
              <Checkbox label={tr.qualityCheck} disabled={!canEdit}
                checked={bool('quality_check')}
                onChange={e => set('quality_check', e.target.checked)} />
            </div>
            <Textarea label={tr.qualityNotes} disabled={!canEdit} className="sm:col-span-2"
              value={str('quality_notes')}
              onChange={e => set('quality_notes', e.target.value)} />
          </div>

          {/* Manufacturer assignments */}
          <div className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0f1b35]">{tr.finishingManufacturers}</h3>
              {canEdit && (
                <Button size="sm" variant="secondary" onClick={addManufacturerRow}>
                  + {tr.addRow}
                </Button>
              )}
            </div>

            {manufacturers.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">{tr.noManufacturers}</p>
            )}

            {manufacturers.map((row, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                {/* Manufacturer name */}
                <div className="sm:col-span-2">
                  <ManufacturerSelect
                    label={tr.manufacturerName}
                    value={row.manufacturer_name ?? ''}
                    onChange={(name, id) => updateManufacturerRow(i, { manufacturer_name: name, manufacturer_id: id })}
                    disabled={!canEdit}
                    filterSpeciality="finishing"
                  />
                </div>

                {/* Qty */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{tr.assignedQty}</label>
                  <input
                    type="number"
                    disabled={!canEdit}
                    value={row.quantity ?? 0}
                    onChange={e => updateManufacturerRow(i, { quantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm
                               focus:outline-none focus:ring-2 focus:ring-[#0f1b35]
                               disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>

                {/* Cost per unit */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{tr.costPerUnit}</label>
                  <input
                    type="number"
                    disabled={!canEdit}
                    value={row.cost_per_unit ?? 0}
                    onChange={e => updateManufacturerRow(i, { cost_per_unit: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm
                               focus:outline-none focus:ring-2 focus:ring-[#0f1b35]
                               disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>

                {/* Subtotal + remove */}
                <div className="sm:col-span-4 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {tr.subtotal}:{' '}
                    <span className="font-bold text-[#0f1b35] tabular-nums">
                      EGP {fmt(row.subtotal ?? 0)}
                    </span>
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeManufacturerRow(i)}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      {tr.removeRow}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Grand total */}
            {manufacturers.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-semibold text-[#0f1b35]">{tr.grandTotalFinishing}</span>
                <span className="text-lg font-bold text-[#c9a84c] tabular-nums">
                  EGP {fmt(grandTotal)}
                </span>
              </div>
            )}
          </div>

          <Textarea label={tr.finishingNotes} disabled={!canEdit}
            value={str('finishing_notes')}
            onChange={e => set('finishing_notes', e.target.value)} />
        </div>
      )}

      {/* ── SUBMITTED ─────────────────────────────────────────────────────── */}
      {stage === 'submitted' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={tr.deliveryDate} type="date" disabled={!canEdit}
            value={str('delivery_date')}
            onChange={e => set('delivery_date', e.target.value)} />
          <Select label={tr.deliveryMethod} disabled={!canEdit}
            value={str('delivery_method') || 'pickup'}
            onChange={e => set('delivery_method', e.target.value)}>
            <option value="pickup">{tr.deliveryMethods.pickup}</option>
            <option value="delivery">{tr.deliveryMethods.delivery}</option>
            <option value="courier">{tr.deliveryMethods.courier}</option>
          </Select>
          <Input label={tr.trackingNumber} disabled={!canEdit}
            value={str('tracking_number')}
            onChange={e => set('tracking_number', e.target.value)} />
          <Input label={tr.deliveryAddress} disabled={!canEdit}
            value={str('delivery_address')}
            onChange={e => set('delivery_address', e.target.value)} />
          <div className="pt-1">
            <Checkbox label={tr.receivedConfirmation} disabled={!canEdit}
              checked={bool('received_confirmation')}
              onChange={e => set('received_confirmation', e.target.checked)} />
          </div>
        </div>
      )}

      {/* ── SHARED NOTES ──────────────────────────────────────────────────── */}
      {/* (Cutting/printing/finishing use stage-specific notes fields above;
           other stages get the generic stage notes) */}
      {!['cutting', 'printing', 'finishing'].includes(stage) && (
        <Textarea label={tr.stageNote} disabled={!canEdit}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={canEdit ? '…' : ''} />
      )}
      {['cutting', 'printing', 'finishing'].includes(stage) && (
        <Textarea label={tr.stageNote} disabled={!canEdit}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={canEdit ? '…' : ''} />
      )}

      {/* Metadata */}
      {stageData?.updated_at && (
        <p className="text-xs text-gray-400">
          {tr.lastUpdated}: {formatDateTime(stageData.updated_at, lang)}
        </p>
      )}

      {/* Save button */}
      {canEdit && (
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} loading={saving}>
            {saved ? '✓ ' + tr.save : tr.save}
          </Button>
        </div>
      )}

      {!canEdit && (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {tr.noPermission}
        </p>
      )}
    </div>
  )
}
