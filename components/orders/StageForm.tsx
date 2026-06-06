'use client'
import { useState, useEffect } from 'react'
import { useLang } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { Input, Textarea, Select, Checkbox } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { formatDateTime } from '@/lib/utils'
import type { Stage, StageData } from '@/lib/types'

interface StageFormProps {
  orderId: string
  stage: Stage
  stageData: StageData | null
  canEdit: boolean
  onSaved?: () => void
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
    const payload = {
      order_id: orderId,
      stage,
      data: formData,
      notes: notes || null,
      updated_by: profile?.id,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('stage_data')
      .upsert(payload, { onConflict: 'order_id,stage' })

    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved?.()
    }
  }

  const d = formData as Record<string, string | number | boolean | undefined>

  return (
    <div className="space-y-4">
      {/* Stage-specific fields */}
      {stage === 'draft' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Textarea label={tr.fabricDescription} disabled={!canEdit}
            value={String(d.fabric_description ?? '')}
            onChange={e => set('fabric_description', e.target.value)} />
          <Input label={tr.quantity} type="number" disabled={!canEdit}
            value={String(d.quantity ?? '')}
            onChange={e => set('quantity', e.target.value ? Number(e.target.value) : '')} />
          <Textarea label={tr.sizeDetails} disabled={!canEdit}
            value={String(d.size_details ?? '')}
            onChange={e => set('size_details', e.target.value)} />
          <Input label={tr.deadline} type="date" disabled={!canEdit}
            value={String(d.deadline ?? '')}
            onChange={e => set('deadline', e.target.value)} />
          <Textarea label={tr.designNotes} disabled={!canEdit} className="sm:col-span-2"
            value={String(d.design_notes ?? '')}
            onChange={e => set('design_notes', e.target.value)} />
        </div>
      )}

      {stage === 'preparation' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Textarea label={tr.materialsList} disabled={!canEdit} className="sm:col-span-2"
            value={String(d.materials_list ?? '')}
            onChange={e => set('materials_list', e.target.value)} />
          <Input label={tr.fabricColor} disabled={!canEdit}
            value={String(d.fabric_color ?? '')}
            onChange={e => set('fabric_color', e.target.value)} />
          <Input label={tr.fabricQuantity} type="number" disabled={!canEdit}
            value={String(d.fabric_quantity ?? '')}
            onChange={e => set('fabric_quantity', e.target.value ? Number(e.target.value) : '')} />
          <Input label={tr.supplierName} disabled={!canEdit}
            value={String(d.supplier_name ?? '')}
            onChange={e => set('supplier_name', e.target.value)} />
          <Input label={tr.estimatedCost} type="number" disabled={!canEdit}
            value={String(d.estimated_cost ?? '')}
            onChange={e => set('estimated_cost', e.target.value ? Number(e.target.value) : '')} />
        </div>
      )}

      {stage === 'cutting_printing' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={tr.cuttingDate} type="date" disabled={!canEdit}
            value={String(d.cutting_date ?? '')}
            onChange={e => set('cutting_date', e.target.value)} />
          <Input label={tr.cuttingWorker} disabled={!canEdit}
            value={String(d.cutting_worker ?? '')}
            onChange={e => set('cutting_worker', e.target.value)} />
          <Select label={tr.printingType} disabled={!canEdit}
            value={String(d.printing_type ?? 'none')}
            onChange={e => set('printing_type', e.target.value)}>
            <option value="none">{tr.printingTypes.none}</option>
            <option value="screen">{tr.printingTypes.screen}</option>
            <option value="digital">{tr.printingTypes.digital}</option>
            <option value="embroidery">{tr.printingTypes.embroidery}</option>
          </Select>
          <Input label={tr.piecesCut} type="number" disabled={!canEdit}
            value={String(d.pieces_cut ?? '')}
            onChange={e => set('pieces_cut', e.target.value ? Number(e.target.value) : '')} />
          <Textarea label={tr.printingDetails} disabled={!canEdit} className="sm:col-span-2"
            value={String(d.printing_details ?? '')}
            onChange={e => set('printing_details', e.target.value)} />
        </div>
      )}

      {stage === 'finishing' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label={tr.finishingType} disabled={!canEdit}
            value={String(d.finishing_type ?? 'machine')}
            onChange={e => set('finishing_type', e.target.value)}>
            <option value="machine">{tr.finishingTypes.machine}</option>
            <option value="hand">{tr.finishingTypes.hand}</option>
          </Select>
          <Input label={tr.finishingWorker} disabled={!canEdit}
            value={String(d.finishing_worker ?? '')}
            onChange={e => set('finishing_worker', e.target.value)} />
          <Input label={tr.packagingType} disabled={!canEdit}
            value={String(d.packaging_type ?? '')}
            onChange={e => set('packaging_type', e.target.value)} />
          <div className="flex flex-col gap-3 pt-1">
            <Checkbox label={tr.ironing} disabled={!canEdit}
              checked={Boolean(d.ironing)}
              onChange={e => set('ironing', e.target.checked)} />
            <Checkbox label={tr.qualityCheck} disabled={!canEdit}
              checked={Boolean(d.quality_check)}
              onChange={e => set('quality_check', e.target.checked)} />
          </div>
          <Textarea label={tr.qualityNotes} disabled={!canEdit} className="sm:col-span-2"
            value={String(d.quality_notes ?? '')}
            onChange={e => set('quality_notes', e.target.value)} />
        </div>
      )}

      {stage === 'submitted' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={tr.deliveryDate} type="date" disabled={!canEdit}
            value={String(d.delivery_date ?? '')}
            onChange={e => set('delivery_date', e.target.value)} />
          <Select label={tr.deliveryMethod} disabled={!canEdit}
            value={String(d.delivery_method ?? 'pickup')}
            onChange={e => set('delivery_method', e.target.value)}>
            <option value="pickup">{tr.deliveryMethods.pickup}</option>
            <option value="delivery">{tr.deliveryMethods.delivery}</option>
            <option value="courier">{tr.deliveryMethods.courier}</option>
          </Select>
          <Input label={tr.trackingNumber} disabled={!canEdit}
            value={String(d.tracking_number ?? '')}
            onChange={e => set('tracking_number', e.target.value)} />
          <Input label={tr.deliveryAddress} disabled={!canEdit}
            value={String(d.delivery_address ?? '')}
            onChange={e => set('delivery_address', e.target.value)} />
          <div className="pt-1">
            <Checkbox label={tr.receivedConfirmation} disabled={!canEdit}
              checked={Boolean(d.received_confirmation)}
              onChange={e => set('received_confirmation', e.target.checked)} />
          </div>
        </div>
      )}

      {/* Notes */}
      <Textarea label={tr.stageNote} disabled={!canEdit}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder={canEdit ? '…' : ''} />

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
