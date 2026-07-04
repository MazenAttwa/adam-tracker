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

  const created = new Date(order.created_at).toLocaleDateString('en-GB')
  const now = new Date().toLocaleString('en-GB')
  const stageTitle = STAGE_TITLES[order.current_stage] ?? order.current_stage
  const phone = order.customer_phone ? ' &middot; ' + esc(order.customer_phone) : ''

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(order.order_number) + '</title><style>'
    + '@page{size:A4;margin:9mm;}'
    + '*{box-sizing:border-box;}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#0f1b35;margin:0;padding:0;font-size:10.5px;line-height:1.35;}'
    + '.head{border-bottom:2.5px solid #c9a84c;padding-bottom:7px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:flex-start;}'
    + '.brand{font-size:17px;font-weight:800;} .brand small{display:block;font-size:10px;color:#888;font-weight:400;}'
    + '.ordno{font-size:15px;font-weight:800;text-align:right;} .meta{font-size:10px;color:#555;text-align:right;margin-top:3px;}'
    + '.cust{background:#f5f5f0;border-radius:6px;padding:7px 11px;margin-bottom:9px;font-size:11px;}'
    + '.sections{column-count:2;column-gap:14px;}'
    + '.section{margin-bottom:9px;break-inside:avoid;-webkit-column-break-inside:avoid;}'
    + '.section h2{font-size:11.5px;margin:0 0 3px;padding-bottom:2px;border-bottom:1px solid #eee;color:#c9a84c;}'
    + 'table.kv{width:100%;border-collapse:collapse;} table.kv td{padding:2px 5px;border-bottom:1px solid #f4f4f4;vertical-align:top;} td.lbl{color:#888;width:42%;}'
    + 'table.mfr{width:100%;border-collapse:collapse;margin-top:4px;font-size:9.5px;} table.mfr th,table.mfr td{padding:2px 4px;border:1px solid #eee;text-align:left;} table.mfr th{background:#f5f5f0;}'
    + '.photos-sec{break-inside:avoid;} .photos{display:flex;flex-wrap:wrap;gap:6px;} .photos img{width:88px;height:88px;object-fit:cover;border-radius:5px;border:1px solid #eee;}'
    + '.footer{margin-top:10px;text-align:center;color:#aaa;font-size:9px;}'
    + '</style></head><body>'
    + '<div class="head"><div class="brand">Adam Store<small>Manufacturing Tracker</small></div>'
    + '<div><div class="ordno">' + esc(order.order_number) + '</div><div class="meta">' + stageTitle + ' &middot; ' + esc(order.status) + '<br>' + created + '</div></div></div>'
    + '<div class="cust"><strong>' + esc(order.customer_name) + '</strong>' + phone + '</div>'
    + '<div class="sections">' + sections + '</div>'
    + photosHtml
    + '<div class="footer">Adam Store &mdash; Generated ' + now + '</div>'
    + '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>'
    + '</body></html>'

  const w = window.open('', '_blank', 'width=900,height=700')
  if (w) { w.document.write(html); w.document.close() }
}