// Shared printable "account statement" PDF for any party (vendor, retailer, ...).
// Transaction-based: debit increases the running balance, credit decreases it.

export interface StatementRow {
  date: string
  description: string
  debit: number
  credit: number
  running: number
}

export interface StatementOptions {
  heading: string          // e.g. "Vendor Account" / "Retailer Account"
  partyName: string
  partyPhone?: string
  owedLabel: string
  paidLabel: string
  remainingLabel: string
  owed: number
  paid: number
  remaining: number
  debitLabel: string       // column header, e.g. "Purchases" / "Sales"
  creditLabel: string      // e.g. "Payments" / "Received"
  balanceLabel: string
  dateLabel: string
  descriptionLabel: string
  statementLabel: string
  rows: StatementRow[]
}

function esc(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function printAccountStatement(o: StatementOptions) {
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const pct = o.owed > 0 ? Math.min(100, Math.round((o.paid / o.owed) * 100)) : (o.paid > 0 ? 100 : 0)
  const now = new Date().toLocaleString('en-GB')
  const settled = o.remaining <= 0.005

  const rows = o.rows.length
    ? o.rows.map(r =>
        '<tr>'
        + '<td>' + esc(r.date) + '</td>'
        + '<td>' + esc(r.description) + '</td>'
        + '<td class="r deb">' + (r.debit ? fmt(r.debit) : '') + '</td>'
        + '<td class="r cre">' + (r.credit ? fmt(r.credit) : '') + '</td>'
        + '<td class="r bal">' + fmt(r.running) + '</td>'
        + '</tr>'
      ).join('')
    : '<tr><td colspan="5" class="empty">-</td></tr>'

  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(o.partyName) + '</title><style>'
    + '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + '@page{size:A4;margin:12mm;}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#0f1b35;margin:0;font-size:12px;}'
    + '.head{border-bottom:2.5px solid #c9a84c;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start;}'
    + '.brand{font-size:18px;font-weight:800;} .brand small{display:block;font-size:11px;color:#888;font-weight:400;}'
    + '.party{font-size:16px;font-weight:800;text-align:right;} .party small{display:block;font-size:11px;color:#666;font-weight:400;}'
    + '.cards{display:flex;gap:10px;margin-bottom:14px;}'
    + '.card{flex:1;border-radius:8px;padding:12px;text-align:center;border:1px solid #eee;}'
    + '.card .lab{font-size:11px;color:#777;} .card .val{font-size:18px;font-weight:800;margin-top:2px;}'
    + '.owed{background:#f8f8f4;} .paidc{background:#f0fdf4;} .paidc .val{color:#16a34a;}'
    + '.remc{background:#fef2f2;} .remc .val{color:#dc2626;} .remc.ok{background:#f0fdf4;} .remc.ok .val{color:#16a34a;}'
    + '.bar-wrap{height:16px;background:#eee;border-radius:8px;overflow:hidden;margin-bottom:4px;}'
    + '.bar{height:100%;background:#16a34a;}'
    + '.bar-lab{font-size:11px;color:#777;margin-bottom:16px;}'
    + 'h2{font-size:13px;color:#c9a84c;border-bottom:1px solid #eee;padding-bottom:3px;margin:14px 0 6px;}'
    + 'table{width:100%;border-collapse:collapse;font-size:11px;}'
    + 'th{background:#f5f5f0;text-align:left;padding:6px 8px;font-size:10px;color:#555;}'
    + 'td{padding:6px 8px;border-bottom:1px solid #f2f2f2;} td.r{text-align:right;}'
    + 'td.deb{color:#dc2626;} td.cre{color:#16a34a;} td.bal{font-weight:700;}'
    + 'td.empty{text-align:center;color:#999;padding:14px;}'
    + '.foot{margin-top:16px;text-align:center;color:#aaa;font-size:10px;}'
    + '</style></head><body>'
    + '<div class="head"><div class="brand">Adam Store<small>' + esc(o.heading) + '</small></div>'
    + '<div class="party">' + esc(o.partyName) + (o.partyPhone ? '<small>' + esc(o.partyPhone) + '</small>' : '') + '<small>' + now + '</small></div></div>'
    + '<div class="cards">'
    + '<div class="card owed"><div class="lab">' + esc(o.owedLabel) + '</div><div class="val">' + fmt(o.owed) + '</div></div>'
    + '<div class="card paidc"><div class="lab">' + esc(o.paidLabel) + '</div><div class="val">' + fmt(o.paid) + '</div></div>'
    + '<div class="card remc ' + (settled ? 'ok' : '') + '"><div class="lab">' + esc(o.remainingLabel) + '</div><div class="val">' + fmt(o.remaining) + '</div></div>'
    + '</div>'
    + '<div class="bar-wrap"><div class="bar" style="width:' + pct + '%"></div></div>'
    + '<div class="bar-lab">' + pct + '%</div>'
    + '<h2>' + esc(o.statementLabel) + '</h2>'
    + '<table><thead><tr><th>' + esc(o.dateLabel) + '</th><th>' + esc(o.descriptionLabel) + '</th>'
    + '<th class="r">' + esc(o.debitLabel) + '</th><th class="r">' + esc(o.creditLabel) + '</th><th class="r">' + esc(o.balanceLabel) + '</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
    + '<div class="foot">Adam Store &mdash; Generated ' + now + '</div>'
    + '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script>'
    + '</body></html>'

  const w = window.open('', '_blank', 'width=900,height=700')
  if (w) { w.document.write(html); w.document.close() }
}
