// Printable Materials report — purchased value, stock value, per-material + per-vendor.

export interface MaterialsReportMaterial {
  name: string
  vendor: string
  unit: string
  photoUrl: string
  purchasedQty: number
  costPerUnit: number
  purchasedValue: number
  currentQty: number
  currentValue: number
}

export interface MaterialsReportVendor {
  name: string
  materials: number
  purchasedValue: number
  paid: number
  remaining: number
}

export interface MaterialsReportOptions {
  brandName: string
  title: string
  generatedLabel: string
  totalPurchased: number
  totalStockValue: number
  totalConsumed: number
  totalPaid: number
  totalRemainingOwed: number
  labels: {
    totalPurchased: string
    stockValue: string
    consumed: string
    paid: string
    remaining: string
    material: string
    vendor: string
    purchasedQty: string
    costPerUnit: string
    purchasedValue: string
    currentQty: string
    currentValue: string
    materialsHeading: string
    vendorsHeading: string
    materials: string
  }
  materials: MaterialsReportMaterial[]
  vendors: MaterialsReportVendor[]
}

function esc(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function printMaterialsReport(o: MaterialsReportOptions) {
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const nf = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  const now = new Date().toLocaleString('en-GB')

  const vendorRows = o.vendors.length
    ? o.vendors.map(v =>
        '<tr>'
        + '<td><b>' + esc(v.name) + '</b></td>'
        + '<td class="r">' + v.materials + '</td>'
        + '<td class="r">' + fmt(v.purchasedValue) + '</td>'
        + '<td class="r paid">' + (v.paid > 0 ? fmt(v.paid) : '-') + '</td>'
        + '<td class="r miss">' + (v.remaining > 0.005 ? fmt(v.remaining) : '-') + '</td>'
        + '</tr>'
      ).join('')
      + '<tr class="tot"><td><b>Total</b></td><td></td>'
      + '<td class="r"><b>' + fmt(o.vendors.reduce((s, v) => s + v.purchasedValue, 0)) + '</b></td>'
      + '<td class="r paid"><b>' + fmt(o.totalPaid) + '</b></td>'
      + '<td class="r miss"><b>' + fmt(o.totalRemainingOwed) + '</b></td></tr>'
    : '<tr><td colspan="5" class="empty">-</td></tr>'

  const matRows = o.materials.length
    ? o.materials.map(m =>
        '<tr>'
        + '<td class="ph">' + (m.photoUrl ? '<img src="' + m.photoUrl + '" />' : '') + '</td>'
        + '<td><b>' + esc(m.name) + '</b></td>'
        + '<td>' + esc(m.vendor) + '</td>'
        + '<td class="r">' + nf(m.purchasedQty) + ' ' + esc(m.unit) + '</td>'
        + '<td class="r">' + fmt(m.costPerUnit) + '</td>'
        + '<td class="r"><b>' + fmt(m.purchasedValue) + '</b></td>'
        + '<td class="r">' + nf(m.currentQty) + ' ' + esc(m.unit) + '</td>'
        + '<td class="r paid">' + fmt(m.currentValue) + '</td>'
        + '</tr>'
      ).join('')
      + '<tr class="tot"><td></td><td colspan="4"><b>Total</b></td>'
      + '<td class="r"><b>' + fmt(o.totalPurchased) + '</b></td><td></td>'
      + '<td class="r paid"><b>' + fmt(o.totalStockValue) + '</b></td></tr>'
    : '<tr><td colspan="8" class="empty">-</td></tr>'

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(o.title) + '</title><style>'
    + '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + '@page{size:A4;margin:11mm;}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#0f1b35;margin:0;font-size:11px;}'
    + '.head{border-bottom:2.5px solid #c9a84c;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start;}'
    + '.brand{font-size:18px;font-weight:800;} .brand small{display:block;font-size:11px;color:#888;font-weight:400;}'
    + '.meta{font-size:15px;font-weight:800;text-align:right;} .meta small{display:block;font-size:10px;color:#666;font-weight:400;}'
    + '.cards{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;}'
    + '.card{flex:1;min-width:120px;border-radius:8px;padding:10px;text-align:center;border:1px solid #eee;background:#f8f8f4;}'
    + '.card .lab{font-size:10px;color:#777;} .card .val{font-size:15px;font-weight:800;margin-top:2px;}'
    + '.card.rec{background:#f0fdf4;} .card.rec .val{color:#16a34a;}'
    + '.card.miss{background:#fef2f2;} .card.miss .val{color:#dc2626;}'
    + 'h2{font-size:13px;color:#c9a84c;border-bottom:1px solid #eee;padding-bottom:3px;margin:16px 0 6px;}'
    + 'table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px;}'
    + 'th{background:#f5f5f0;text-align:left;padding:5px 7px;font-size:9px;color:#555;}'
    + 'td{padding:5px 7px;border-bottom:1px solid #f2f2f2;} td.r{text-align:right;}'
    + 'td.paid{color:#16a34a;} td.miss{color:#dc2626;font-weight:700;}'
    + 'tr.tot td{background:#f5f5f0;}'
    + 'td.empty{text-align:center;color:#999;padding:14px;}'
    + 'td.ph{width:44px;} td.ph img{width:38px;height:38px;object-fit:cover;border-radius:5px;border:1px solid #eee;}'
    + '.foot{margin-top:16px;text-align:center;color:#aaa;font-size:10px;}'
    + '</style></head><body>'
    + '<div class="head"><div class="brand">' + esc(o.brandName) + '<small>' + esc(o.title) + '</small></div>'
    + '<div class="meta">' + esc(o.title) + '<small>' + esc(o.generatedLabel) + ' ' + now + '</small></div></div>'

    + '<div class="cards">'
    + '<div class="card"><div class="lab">' + esc(o.labels.totalPurchased) + '</div><div class="val">' + fmt(o.totalPurchased) + '</div></div>'
    + '<div class="card rec"><div class="lab">' + esc(o.labels.stockValue) + '</div><div class="val">' + fmt(o.totalStockValue) + '</div></div>'
    + '<div class="card"><div class="lab">' + esc(o.labels.consumed) + '</div><div class="val">' + fmt(o.totalConsumed) + '</div></div>'
    + '<div class="card rec"><div class="lab">' + esc(o.labels.paid) + '</div><div class="val">' + fmt(o.totalPaid) + '</div></div>'
    + '<div class="card miss"><div class="lab">' + esc(o.labels.remaining) + '</div><div class="val">' + fmt(o.totalRemainingOwed) + '</div></div>'
    + '</div>'

    + '<h2>' + esc(o.labels.vendorsHeading) + '</h2>'
    + '<table><thead><tr><th>' + esc(o.labels.vendor) + '</th><th class="r">' + esc(o.labels.materials) + '</th>'
    + '<th class="r">' + esc(o.labels.purchasedValue) + '</th><th class="r">' + esc(o.labels.paid) + '</th>'
    + '<th class="r">' + esc(o.labels.remaining) + '</th></tr></thead><tbody>' + vendorRows + '</tbody></table>'

    + '<h2>' + esc(o.labels.materialsHeading) + '</h2>'
    + '<table><thead><tr><th></th><th>' + esc(o.labels.material) + '</th><th>' + esc(o.labels.vendor) + '</th>'
    + '<th class="r">' + esc(o.labels.purchasedQty) + '</th><th class="r">' + esc(o.labels.costPerUnit) + '</th>'
    + '<th class="r">' + esc(o.labels.purchasedValue) + '</th><th class="r">' + esc(o.labels.currentQty) + '</th>'
    + '<th class="r">' + esc(o.labels.currentValue) + '</th></tr></thead><tbody>' + matRows + '</tbody></table>'

    + '<div class="foot">' + esc(o.brandName) + ' &mdash; ' + esc(o.generatedLabel) + ' ' + now + '</div>'
    + '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script>'
    + '</body></html>'

  const w = window.open('', '_blank', 'width=1000,height=700')
  if (w) { w.document.write(html); w.document.close() }
}
