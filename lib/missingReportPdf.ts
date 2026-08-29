// Printable "Missing Items" report — loss across every order + by stage + by manufacturer.

export interface MissingOrderRow {
  orderNumber: string
  product: string
  expected: number
  received: number
  missing: number
  lossPct: number
}

export interface MissingStageRow {
  stage: string
  lost: number
}

export interface MissingManufacturerRow {
  name: string
  handled: number
  lost: number
  lossPct: number
}

export interface MissingReportOptions {
  brandName: string
  title: string
  generatedLabel: string
  totalExpected: number
  totalReceived: number
  totalMissing: number
  overallPct: number
  expectedLabel: string
  receivedLabel: string
  missingLabel: string
  lossPctLabel: string
  orders: MissingOrderRow[]
  ordersHeading: string
  orderLabel: string
  productLabel: string
  byStage: MissingStageRow[]
  byStageHeading: string
  stageLabel: string
  lostLabel: string
  byManufacturer: MissingManufacturerRow[]
  byManufacturerHeading: string
  manufacturerLabel: string
  handledLabel: string
}

function esc(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function printMissingReport(o: MissingReportOptions) {
  const nf = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  const pf = (n: number) => n.toFixed(1) + '%'
  const now = new Date().toLocaleString('en-GB')

  const rowClass = (pct: number) => (pct >= 15 ? 'hi' : pct >= 5 ? 'mid' : '')

  const orderRows = o.orders.length
    ? o.orders.map(r =>
        '<tr class="' + rowClass(r.lossPct) + '">'
        + '<td><b>' + esc(r.orderNumber) + '</b></td>'
        + '<td>' + esc(r.product) + '</td>'
        + '<td class="r">' + nf(r.expected) + '</td>'
        + '<td class="r">' + nf(r.received) + '</td>'
        + '<td class="r miss">' + nf(r.missing) + '</td>'
        + '<td class="r"><b>' + pf(r.lossPct) + '</b></td>'
        + '</tr>'
      ).join('')
    : '<tr><td colspan="6" class="empty">No missing items - every order fully received.</td></tr>'

  const stageRows = o.byStage.length
    ? o.byStage.map(s =>
        '<tr><td style="text-transform:capitalize">' + esc(s.stage) + '</td><td class="r miss"><b>' + nf(s.lost) + '</b></td></tr>'
      ).join('')
    : '<tr><td colspan="2" class="empty">-</td></tr>'

  const mfrRows = o.byManufacturer.length
    ? o.byManufacturer.map(m =>
        '<tr class="' + rowClass(m.lossPct) + '">'
        + '<td><b>' + esc(m.name) + '</b></td>'
        + '<td class="r">' + nf(m.handled) + '</td>'
        + '<td class="r miss">' + nf(m.lost) + '</td>'
        + '<td class="r"><b>' + pf(m.lossPct) + '</b></td>'
        + '</tr>'
      ).join('')
    : '<tr><td colspan="4" class="empty">-</td></tr>'

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(o.title) + '</title><style>'
    + '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + '@page{size:A4;margin:12mm;}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#0f1b35;margin:0;font-size:12px;}'
    + '.head{border-bottom:2.5px solid #c9a84c;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start;}'
    + '.brand{font-size:18px;font-weight:800;} .brand small{display:block;font-size:11px;color:#888;font-weight:400;}'
    + '.meta{font-size:16px;font-weight:800;text-align:right;} .meta small{display:block;font-size:11px;color:#666;font-weight:400;}'
    + '.cards{display:flex;gap:10px;margin-bottom:16px;}'
    + '.card{flex:1;border-radius:8px;padding:12px;text-align:center;border:1px solid #eee;background:#f8f8f4;}'
    + '.card .lab{font-size:11px;color:#777;} .card .val{font-size:18px;font-weight:800;margin-top:2px;}'
    + '.card.miss{background:#fef2f2;} .card.miss .val{color:#dc2626;}'
    + '.card.rec{background:#f0fdf4;} .card.rec .val{color:#16a34a;}'
    + 'h2{font-size:13px;color:#c9a84c;border-bottom:1px solid #eee;padding-bottom:3px;margin:16px 0 6px;}'
    + 'table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px;}'
    + 'th{background:#f5f5f0;text-align:left;padding:6px 8px;font-size:10px;color:#555;}'
    + 'td{padding:6px 8px;border-bottom:1px solid #f2f2f2;} td.r{text-align:right;} td.miss{color:#dc2626;font-weight:700;}'
    + 'tr.hi td{background:#fef2f2;} tr.mid td{background:#fffbeb;}'
    + 'td.empty{text-align:center;color:#999;padding:14px;}'
    + '.legend{font-size:10px;color:#999;margin-top:4px;}'
    + '.foot{margin-top:16px;text-align:center;color:#aaa;font-size:10px;}'
    + '</style></head><body>'
    + '<div class="head"><div class="brand">' + esc(o.brandName) + '<small>' + esc(o.title) + '</small></div>'
    + '<div class="meta">' + esc(o.title) + '<small>' + esc(o.generatedLabel) + ' ' + now + '</small></div></div>'

    + '<div class="cards">'
    + '<div class="card"><div class="lab">' + esc(o.expectedLabel) + '</div><div class="val">' + nf(o.totalExpected) + '</div></div>'
    + '<div class="card rec"><div class="lab">' + esc(o.receivedLabel) + '</div><div class="val">' + nf(o.totalReceived) + '</div></div>'
    + '<div class="card miss"><div class="lab">' + esc(o.missingLabel) + '</div><div class="val">' + nf(o.totalMissing) + '</div></div>'
    + '<div class="card miss"><div class="lab">' + esc(o.lossPctLabel) + '</div><div class="val">' + pf(o.overallPct) + '</div></div>'
    + '</div>'

    + '<h2>' + esc(o.ordersHeading) + '</h2>'
    + '<table><thead><tr><th>' + esc(o.orderLabel) + '</th><th>' + esc(o.productLabel) + '</th>'
    + '<th class="r">' + esc(o.expectedLabel) + '</th><th class="r">' + esc(o.receivedLabel) + '</th>'
    + '<th class="r">' + esc(o.missingLabel) + '</th><th class="r">' + esc(o.lossPctLabel) + '</th></tr></thead>'
    + '<tbody>' + orderRows + '</tbody></table>'
    + '<p class="legend">Rows shaded red = loss &ge; 15% &middot; amber = loss &ge; 5%</p>'

    + '<h2>' + esc(o.byStageHeading) + '</h2>'
    + '<table><thead><tr><th>' + esc(o.stageLabel) + '</th><th class="r">' + esc(o.lostLabel) + '</th></tr></thead>'
    + '<tbody>' + stageRows + '</tbody></table>'

    + '<h2>' + esc(o.byManufacturerHeading) + '</h2>'
    + '<table><thead><tr><th>' + esc(o.manufacturerLabel) + '</th><th class="r">' + esc(o.handledLabel) + '</th>'
    + '<th class="r">' + esc(o.lostLabel) + '</th><th class="r">' + esc(o.lossPctLabel) + '</th></tr></thead>'
    + '<tbody>' + mfrRows + '</tbody></table>'

    + '<div class="foot">' + esc(o.brandName) + ' &mdash; ' + esc(o.generatedLabel) + ' ' + now + '</div>'
    + '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script>'
    + '</body></html>'

  const w = window.open('', '_blank', 'width=900,height=700')
  if (w) { w.document.write(html); w.document.close() }
}
