import { createClient } from '@/lib/supabase/client'
import type { Order, StageData } from '@/lib/types'

const LABELS: Record<string, string> = {
  fabric_description: 'Fabric Description', quantity: 'Quantity (pcs)', size_details: 'Size Details',
  deadline: 'Deadline', design_notes: 'Design Notes', fabric_type: 'Fabric Type',
  fabric_cost_per_unit: 'Fabric Cost / Unit', fabric_quantity: 'Fabric Quantity', fabric_unit: 'Unit',
  fabric_total_cost: 'Fabric Total', fabric_supplier: 'Supplier',
  cutting_cost_per_unit: 'Cutting Cost / Unit', quantity_to_cut: 'Quantity to Cut',
  total_cutting_cost: 'Cutting Total', manufacturer_name: 'Manufacturer', cutting_notes: 'Cutting Notes',
  printing_cost_per_unit: 'Printing Cost / Unit', quantity_to_print: 'Quantity to Print',
  total_printing_cost: 'Printing Total', printing_location: 'Printing Location', printing_notes: 'Printing Notes',
  grand_total_finishing_cost: 'Finishing Total', quantity_submitted: 'Quantity Submitted',
  delivery_date: 'Delivery Date', delivery_method: 'Delivery Method', tracking_number: 'Tracking Number',
  delivery_address: 'Delivery Address', quantity_received: 'Quantity Received', price_per_piece: 'Price / Piece',
  received_date: 'Received Date', total_received_revenue: 'Total Received Revenue', logistic_cost: 'Logistics Cost',
}
const STAGE_TITLES: Record<string, string> = {
  draft: 'Draft', preparation: 'Preparation', cutting: 'Cutting', printing: 'Printing',
  finishing: 'Finishing', submitted: 'Submitted to Customer', received: 'Received by Customer',
}
const ORDER = ['draft', 'preparation', 'cutting', 'printing', 'finishing', 'submitted', 'received']

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function pretty(k: string) { return LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

function pieceJourneyHtml(stageDataMap: Record<string, StageData>): string {
  const num = (stage: string, key: string) => {
    const v = (stageDataMap[stage]?.data as Record<string, unknown> | undefined)?.[key]
    return typeof v === 'number' ? v : 0
  }
  const arr = (stageDataMap['finishing']?.data as Record<string, unknown> | undefined)?.['manufacturers']
  const finishingQty = Array.isArray(arr) ? (arr as { quantity?: number }[]).reduce((s, m) => s + (m.quantity ?? 0), 0) : 0
  const steps = [
    { label: 'Draft', qty: num('draft', 'quantity') },
    { label: 'Cutting', qty: num('cutting', 'quantity_to_cut') },
    { label: 'Printing', qty: num('printing', 'quantity_to_print') },
    { label: 'Finishing', qty: finishingQty },
    { label: 'Submitted', qty: num('submitted', 'quantity_submitted') },
    { label: 'Received', qty: num('received', 'quantity_received') },
  ]
  const expected = steps[0].qty
  if (expected <= 0) return ''
  const maxQty = Math.max(...steps.map(s => s.qty), 1)
  const finalQty = steps[5].qty || steps[4].qty || 0
  const missing = expected - finalQty
  const badge = finalQty > 0
    ? (missing > 0
        ? '<span class="pj-badge pj-bad">Missing: ' + missing + ' (' + ((missing / expected) * 100).toFixed(1) + '%)</span>'
        : '<span class="pj-badge pj-ok">Complete &#10003;</span>')
    : ''
  const cols = steps.map((s, i) => {
    const h = s.qty > 0 ? Math.max(Math.round((s.qty / maxQty) * 96), 4) : 2
    const color = i === 0 ? '#0f1b35' : s.qty === 0 ? '#e5e7eb' : s.qty < expected ? '#f59e0b' : '#22c55e'
    const diff = expected > 0 ? s.qty - expected : 0
    const diffHtml = (i > 0 && s.qty > 0 && diff !== 0)
      ? '<div class="pj-diff" style="color:' + (diff < 0 ? '#dc2626' : '#16a34a') + '">' + (diff > 0 ? '+' : '') + diff + '</div>'
      : '<div class="pj-diff">&nbsp;</div>'
    return '<div class="pj-col"><div class="pj-box"><div class="pj-val">' + s.qty + '</div>'
      + '<div class="pj-bar" style="height:' + h + 'px;background:' + color + '"></div></div>'
      + '<div class="pj-lab">' + s.label + '</div>' + diffHtml + '</div>'
  }).join('')
  return '<div class="section pj"><div class="pj-head"><h2>Piece Journey (quantity through stages)</h2>' + badge + '</div>'
    + '<div class="pj-bars">' + cols + '</div>'
    + '<p class="pj-foot">Expected: ' + expected + ' &middot; Received: ' + (steps[5].qty || '-') + '</p></div>'
}

export async function downloadOrderPdf(order: Order, stageDataMap: Record<string, StageData>) {
  const supabase = createClient()
  let photosHtml = ''
  try {
    const { data: photos } = await supabase.from('order_photos').select('file_path').eq('order_id', order.id)
    const paths = ((photos ?? []) as { file_path: string }[]).map(p => p.file_path).filter(Boolean)
    if (paths.length) {
      const imgs = paths.map(p => {
        const { data } = supabase.storage.from('product-photos').getPublicUrl(p)
        return '<img src="' + data.publicUrl + '" />'
      }).join('')
      photosHtml = '<div class="section photos-sec"><h2>Product Photos</h2><div class="photos">' + imgs + '</div></div>'
    }
  } catch { /* ignore */ }

  const sections = ORDER.filter(st => stageDataMap[st]).map(st => {
    const sd = stageDataMap[st]
    const data = (sd?.data ?? {}) as Record<string, unknown>
    const fieldRows = Object.entries(data)
      .filter(([k, v]) => k !== 'manufacturers' && (typeof v === 'string' || typeof v === 'number') && v !== '' && v !== null && v !== 0)
      .map(([k, v]) => '<tr><td class="lbl">' + pretty(k) + '</td><td>' + esc(String(v)) + '</td></tr>').join('')
    let mfrHtml = ''
    const mfrs = data['manufacturers']
    if (Array.isArray(mfrs) && mfrs.length) {
      const rows = (mfrs as { manufacturer_name?: string; quantity?: number; cost_per_unit?: number; subtotal?: number }[])
        .map(m => '<tr><td>' + esc(m.manufacturer_name ?? '') + '</td><td>' + (m.quantity ?? '') + '</td><td>' + (m.cost_per_unit ?? '') + '</td><td>' + (m.subtotal ?? 0).toFixed(2) + '</td></tr>').join('')
      mfrHtml = '<table class="mfr"><thead><tr><th>Manufacturer</th><th>Qty</th><th>C/U</th><th>Subtotal</th></tr></thead><tbody>' + rows + '</tbody></table>'
    }
    const notes = sd?.notes ? '<tr><td class="lbl">Notes</td><td>' + esc(sd.notes) + '</td></tr>' : ''
    if (!fieldRows && !mfrHtml && !notes) return ''
    return '<div class="section"><h2>' + STAGE_TITLES[st] + '</h2><table class="kv"><tbody>' + fieldRows + notes + '</tbody></table>' + mfrHtml + '</div>'
  }).filter(Boolean).join('')

  // Fabric-swatch stamp boxes: staple a physical piece of each material here.
  let swatchLabels: string[] = []
  try {
    const { data: oms } = await supabase
      .from('order_materials')
      .select('quantity_needed, materials(name, unit)')
      .eq('order_id', order.id)
    const list = ((oms ?? []) as unknown as { quantity_needed: number; materials: { name: string; unit: string } | { name: string; unit: string }[] | null }[])
      .map(r => {
        const m = Array.isArray(r.materials) ? r.materials[0] : r.materials
        return m?.name ? (m.name + (r.quantity_needed ? ' - ' + r.quantity_needed + ' ' + (m.unit ?? '') : '')) : ''
      })
      .filter(Boolean)
    swatchLabels = list
  } catch { /* ignore */ }
  // Always show at least 4 boxes; pad blanks so there is room to add more by hand.
  while (swatchLabels.length < 4) swatchLabels.push('')
  const swatchBoxes = swatchLabels.map(lbl =>
    '<div class="swatch"><div class="swatch-box"></div><div class="swatch-lbl">' + (lbl ? esc(lbl) : '&nbsp;') + '</div></div>'
  ).join('')
  const swatchHtml = '<div class="section swatch-sec"><h2>Material Samples (staple physical swatch)</h2>'
    + '<div class="swatches">' + swatchBoxes + '</div></div>'

  const created = new Date(order.created_at).toLocaleDateString('en-GB')
  const now = new Date().toLocaleString('en-GB')
  const stageTitle = STAGE_TITLES[order.current_stage] ?? order.current_stage
  const phone = order.customer_phone ? ' &middot; ' + esc(order.customer_phone) : ''
  const pj = pieceJourneyHtml(stageDataMap)

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(order.order_number) + '</title><style>'
    + '@page{size:A4;margin:9mm;}'
    + '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + 'html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} body{font-family:Arial,Helvetica,sans-serif;color:#0f1b35;margin:0;padding:0;font-size:10.5px;line-height:1.35;}'
    + '.head{border-bottom:2.5px solid #c9a84c;padding-bottom:7px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;}'
    + '.brand{font-size:17px;font-weight:800;} .brand small{display:block;font-size:10px;color:#888;font-weight:400;}'
    + '.ordno{font-size:15px;font-weight:800;text-align:right;} .meta{font-size:10px;color:#555;text-align:right;margin-top:3px;}'
    + '.cust{background:#f5f5f0;border-radius:6px;padding:7px 11px;margin-bottom:9px;font-size:11px;}'
    + '.sections{column-count:2;column-gap:14px;}'
    + '.section{margin-bottom:9px;break-inside:avoid;-webkit-column-break-inside:avoid;}'
    + '.section h2{font-size:11.5px;margin:0 0 3px;padding-bottom:2px;border-bottom:1px solid #eee;color:#c9a84c;}'
    + 'table.kv{width:100%;border-collapse:collapse;} table.kv td{padding:2px 5px;border-bottom:1px solid #f4f4f4;vertical-align:top;} td.lbl{color:#888;width:42%;}'
    + 'table.mfr{width:100%;border-collapse:collapse;margin-top:4px;font-size:9.5px;} table.mfr th,table.mfr td{padding:2px 4px;border:1px solid #eee;text-align:left;} table.mfr th{background:#f5f5f0;}'
    + '.photos-sec{break-inside:avoid;} .photos{display:flex;flex-wrap:wrap;gap:10px;} .photos img{width:176px;height:176px;object-fit:cover;border-radius:6px;border:1px solid #eee;}'
    + '.pj{break-inside:avoid;margin-top:6px;} .pj h2{color:#0f1b35;border:none;font-size:13px;margin:0;} .pj-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}'
    + '.pj-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;} .pj-bad{color:#dc2626;background:#fef2f2;} .pj-ok{color:#16a34a;background:#f0fdf4;}'
    + '.pj-bars{display:flex;align-items:flex-end;gap:8px;}'
    + '.pj-col{flex:1;display:flex;flex-direction:column;align-items:center;}'
    + '.pj-box{height:108px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;width:100%;}'
    + '.pj-val{font-size:12px;font-weight:700;margin-bottom:2px;} .pj-bar{width:26px;border-radius:4px 4px 0 0;}'
    + '.pj-lab{font-size:10px;color:#555;margin-top:4px;text-align:center;} .pj-diff{font-size:10px;font-weight:600;}'
    + '.pj-foot{font-size:9.5px;color:#999;margin-top:6px;}'
    + '.swatch-sec{break-inside:avoid;margin-top:10px;} .swatches{display:flex;gap:12px;flex-wrap:wrap;}'
    + '.swatch{display:flex;flex-direction:column;align-items:center;width:120px;}'
    + '.swatch-box{width:120px;height:120px;border:1.5px dashed #c9a84c;border-radius:6px;background:repeating-linear-gradient(45deg,#fafafa,#fafafa 6px,#f2f2ec 6px,#f2f2ec 12px);}'
    + '.swatch-lbl{font-size:9px;color:#555;text-align:center;margin-top:4px;min-height:22px;border-bottom:1px solid #ddd;width:100%;padding-bottom:2px;}'
    + '.footer{margin-top:12px;text-align:center;color:#aaa;font-size:9px;}'
    + '</style></head><body>'
    + '<div class="head"><div class="brand">Adam Store<small>Manufacturing Tracker</small></div>'
    + '<div><div class="ordno">' + esc(order.order_number) + '</div><div class="meta">' + stageTitle + ' &middot; ' + esc(order.status) + '<br>' + created + '</div></div></div>'
    + '<div class="cust"><strong>' + esc(order.customer_name) + '</strong>' + phone + '</div>'
    + '<div class="sections">' + sections + '</div>'
    + photosHtml
    + swatchHtml
    + pj
    + '<div class="footer">Adam Store &mdash; Generated ' + now + '</div>'
    + '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>'
    + '</body></html>'

  const w = window.open('', '_blank', 'width=900,height=700')
  if (w) { w.document.write(html); w.document.close() }
}