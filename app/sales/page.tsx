'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { useToast } from '@/contexts/ToastContext'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import type { Sale, SaleItem, DeliveryStatus, Retailer, Order } from '@/lib/types'

interface SaleItemForm {
  name: string
  quantity: string
  unit_price: string
}

interface SaleForm {
  date: string
  retailer_id: string
  order_id: string
  delivery_status: DeliveryStatus
  delivery_date: string
  delivery_notes: string
  notes: string
  invoice_number: string
}

const today = () => new Date().toISOString().split('T')[0]

const emptyForm = (): SaleForm => ({
  date: today(),
  retailer_id: '',
  order_id: '',
  delivery_status: 'pending',
  delivery_date: '',
  delivery_notes: '',
  notes: '',
  invoice_number: '',
})

const DELIVERY_COLORS: Record<DeliveryStatus, string> = {
  pending: 'bg-gray-100 text-gray-700 border-gray-200',
  out_for_delivery: 'bg-blue-100 text-blue-700 border-blue-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  returned: 'bg-red-100 text-red-700 border-red-200',
}

export default function SalesPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const { showToast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  const [sales, setSales] = useState<Sale[]>([])
  const [retailers, setRetailers] = useState<Retailer[]>([])
  const [orders, setOrders] = useState<Pick<Order, 'id' | 'order_number'>[]>([])
  const [fetching, setFetching] = useState(true)
  const [filterRetailer, setFilterRetailer] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [showDelete, setShowDelete] = useState<Sale | null>(null)
  const [form, setForm] = useState<SaleForm>(emptyForm())
  const [saleItems, setSaleItems] = useState<SaleItemForm[]>([{ name: '', quantity: '1', unit_price: '0' }])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')

  const saleTotal = saleItems.reduce(
    (s, item) => s + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0),
    0
  )

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    Promise.all([fetchSales(), fetchRetailers(), fetchOrders()]).finally(() => setFetching(false))
  }, [profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchSales() {
    const { data } = await supabase
      .from('sales')
      .select('*, retailers(id, name, phone, address), orders(order_number)')
      .order('date', { ascending: false })
      .limit(200)
    setSales(data ?? [])
  }

  async function fetchRetailers() {
    const { data } = await supabase.from('retailers').select('*').order('name')
    setRetailers(data ?? [])
  }

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders').select('id, order_number').eq('status', 'active')
      .order('order_number', { ascending: false }).limit(100)
    setOrders(data ?? [])
  }

  function setField(k: keyof SaleForm, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function addItem() {
    setSaleItems(p => [...p, { name: '', quantity: '1', unit_price: '0' }])
  }

  function removeItem(i: number) {
    setSaleItems(p => p.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, k: keyof SaleItemForm, v: string) {
    setSaleItems(p => p.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
  }

  async function openAdd() {
    const year = new Date().getFullYear()
    const { count } = await supabase
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .gte('date', `${year}-01-01`)
    const invoiceNum = `INV-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`
    setForm({ ...emptyForm(), invoice_number: invoiceNum })
    setSaleItems([{ name: '', quantity: '1', unit_price: '0' }])
    setEditingSale(null)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(sale: Sale) {
    setForm({
      date: sale.date,
      retailer_id: sale.retailer_id ?? '',
      order_id: sale.order_id ?? '',
      delivery_status: sale.delivery_status,
      delivery_date: sale.delivery_date ?? '',
      delivery_notes: sale.delivery_notes ?? '',
      notes: sale.notes ?? '',
      invoice_number: sale.invoice_number,
    })
    setSaleItems(sale.items.map(i => ({
      name: i.name,
      quantity: String(i.quantity),
      unit_price: String(i.unit_price),
    })))
    setEditingSale(sale)
    setFormError('')
    setShowForm(true)
  }

  async function handleSave() {
    setFormError('')
    if (!form.retailer_id) { setFormError(tr.required); return }
    if (!form.date) { setFormError(tr.required); return }

    const itemsToSave: SaleItem[] = saleItems
      .filter(i => i.name.trim())
      .map(i => ({
        name: i.name.trim(),
        quantity: parseFloat(i.quantity) || 0,
        unit_price: parseFloat(i.unit_price) || 0,
        total: (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0),
      }))

    if (itemsToSave.length === 0) { setFormError(tr.required); return }

    const totalAmount = itemsToSave.reduce((s, i) => s + i.total, 0)
    setSaving(true)

    if (editingSale) {
      // Deduct old total from old retailer
      const oldRetailer = retailers.find(r => r.id === editingSale.retailer_id)
      if (oldRetailer) {
        await supabase.from('retailers').update({
          balance: Math.max(0, oldRetailer.balance - editingSale.total_amount),
          updated_at: new Date().toISOString(),
        }).eq('id', editingSale.retailer_id)
      }

      // Update the sale
      await supabase.from('sales').update({
        date: form.date,
        retailer_id: form.retailer_id,
        order_id: form.order_id || null,
        items: itemsToSave,
        total_amount: totalAmount,
        delivery_status: form.delivery_status,
        delivery_date: form.delivery_date || null,
        delivery_notes: form.delivery_notes.trim() || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', editingSale.id)

      // Add new total to new retailer (re-fetch balance in case it's the same retailer)
      const { data: freshRetailer } = await supabase
        .from('retailers').select('balance').eq('id', form.retailer_id).single()
      if (freshRetailer) {
        await supabase.from('retailers').update({
          balance: (freshRetailer as { balance: number }).balance + totalAmount,
          updated_at: new Date().toISOString(),
        }).eq('id', form.retailer_id)
      }
    } else {
      // Insert new sale
      await supabase.from('sales').insert({
        invoice_number: form.invoice_number,
        date: form.date,
        retailer_id: form.retailer_id,
        order_id: form.order_id || null,
        items: itemsToSave,
        total_amount: totalAmount,
        delivery_status: form.delivery_status,
        delivery_date: form.delivery_date || null,
        delivery_notes: form.delivery_notes.trim() || null,
        notes: form.notes.trim() || null,
        created_by: profile?.id,
      })

      // Add total to retailer balance
      const retailer = retailers.find(r => r.id === form.retailer_id)
      if (retailer) {
        await supabase.from('retailers').update({
          balance: retailer.balance + totalAmount,
          updated_at: new Date().toISOString(),
        }).eq('id', form.retailer_id)
      }

      // Mark linked order as completed
      if (form.order_id) {
        await supabase.from('orders').update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        }).eq('id', form.order_id)
      }
    }

    showToast(tr.savedOk)
    setSaving(false)
    setShowForm(false)
    Promise.all([fetchSales(), fetchRetailers()])
  }

  async function handleDelete() {
    if (!showDelete) return
    setDeleting(true)

    // Restore retailer balance
    const retailer = retailers.find(r => r.id === showDelete.retailer_id)
    if (retailer) {
      await supabase.from('retailers').update({
        balance: Math.max(0, retailer.balance - showDelete.total_amount),
        updated_at: new Date().toISOString(),
      }).eq('id', showDelete.retailer_id)
    }

    await supabase.from('sales').delete().eq('id', showDelete.id)
    setDeleting(false)
    setShowDelete(null)
    Promise.all([fetchSales(), fetchRetailers()])
  }

  function printInvoice(sale: Sale) {
    const retailer = retailers.find(r => r.id === sale.retailer_id) ?? sale.retailers as Retailer | undefined
    const itemRows = sale.items.map(item => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${item.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${item.unit_price.toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${item.total.toFixed(2)}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${sale.invoice_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:#1a1a2e;font-size:14px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
    .brand{font-size:22px;font-weight:700;color:#0f1b35}
    .brand-sub{font-size:12px;color:#888;margin-top:2px}
    .inv-title{font-size:18px;font-weight:700;color:#c9a84c;text-align:right}
    .inv-num{font-size:20px;font-weight:600;text-align:right;margin-top:4px}
    .inv-date{color:#888;text-align:right;margin-top:4px}
    hr{border:none;border-top:2px solid #eee;margin:24px 0}
    .parties{display:flex;justify-content:space-between;margin-bottom:32px}
    .party h4{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:8px}
    .party p{margin:2px 0;font-size:13px}
    table{width:100%;border-collapse:collapse;margin-bottom:0}
    thead{background:#f5f5f0}
    th{padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#555;font-weight:600}
    th:nth-child(2),th:nth-child(3),th:last-child{text-align:right}
    .total-row td{padding:14px 12px;font-weight:700;font-size:16px;background:#f5f5f0}
    .footer{margin-top:48px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:16px}
    @media print{body{padding:20px}}
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Adam Store</div>
      <div class="brand-sub">Manufacturing Tracker</div>
    </div>
    <div>
      <div class="inv-title">INVOICE</div>
      <div class="inv-num">${sale.invoice_number}</div>
      <div class="inv-date">${sale.date}</div>
    </div>
  </div>
  <hr>
  <div class="parties">
    <div class="party">
      <h4>From</h4>
      <p style="font-weight:600">Adam Store</p>
      <p>Manufacturing &amp; Production</p>
    </div>
    <div class="party" style="text-align:right">
      <h4>Bill To</h4>
      <p style="font-weight:600">${retailer?.name ?? sale.customer_name ?? '—'}</p>
      ${retailer?.phone ? `<p>${retailer.phone}</p>` : ''}
      ${retailer?.address ? `<p>${retailer.address}</p>` : ''}
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3" style="text-align:right;padding-right:12px">Total Amount</td>
        <td style="text-align:right;padding:14px 12px;font-weight:700;font-size:18px;background:#f5f5f0">${sale.total_amount.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">Adam Store &mdash; Thank you for your business!</div>
  <script>window.print()</script>
</body>
</html>`

    const w = window.open('', '_blank', 'width=820,height=650')
    w?.document.write(html)
    w?.document.close()
  }

  function deliveryLabel(status: DeliveryStatus) {
    switch (status) {
      case 'pending': return tr.pending
      case 'out_for_delivery': return tr.outForDelivery
      case 'delivered': return tr.delivered
      case 'returned': return tr.returned
    }
  }

  const filtered = sales.filter(s => {
    if (filterRetailer && s.retailer_id !== filterRetailer) return false
    if (filterStatus && s.delivery_status !== filterStatus) return false
    return true
  })

  const totalSales = filtered.reduce((s, sale) => s + sale.total_amount, 0)

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
            <h1 className="text-2xl font-bold text-[#0f1b35]">{tr.sales}</h1>
            <p className="text-gray-500 text-sm mt-1">{tr.appName} · {tr.appTagline}</p>
          </div>
          <Button onClick={openAdd}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {tr.addSale}
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: `${tr.totalAmount} (${tr.all})`, value: sales.reduce((s, sale) => s + sale.total_amount, 0).toFixed(2), color: 'text-[#0f1b35]', bg: 'bg-white' },
            { label: tr.delivered, value: String(sales.filter(s => s.delivery_status === 'delivered').length), color: 'text-green-700', bg: 'bg-green-50' },
            { label: tr.pending, value: String(sales.filter(s => s.delivery_status === 'pending').length), color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: tr.returned, value: String(sales.filter(s => s.delivery_status === 'returned').length), color: 'text-red-700', bg: 'bg-red-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-5 border border-gray-100 shadow-sm`}>
              <p className="text-xs text-gray-500 leading-tight">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Select value={filterRetailer} onChange={e => setFilterRetailer(e.target.value)} className="sm:w-56">
            <option value="">{tr.linkRetailerLabel} — {tr.all}</option>
            {retailers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="sm:w-44">
            <option value="">{tr.allStatuses}</option>
            <option value="pending">{tr.pending}</option>
            <option value="out_for_delivery">{tr.outForDelivery}</option>
            <option value="delivered">{tr.delivered}</option>
            <option value="returned">{tr.returned}</option>
          </Select>
          {(filterRetailer || filterStatus) && (
            <p className="text-sm text-gray-500 self-center">
              {filtered.length} {tr.orders.toLowerCase()} · {totalSales.toFixed(2)} {tr.totalAmount.toLowerCase()}
            </p>
          )}
        </div>

        {/* Sales table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 text-sm">{tr.noSales}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.invoiceNumber}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.date}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.linkRetailerLabel}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.saleItems}</th>
                    <th className="text-right px-5 py-3 font-medium text-gray-600">{tr.totalAmount}</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">{tr.deliveryStatusLabel}</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(sale => (
                    <tr key={sale.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{sale.invoice_number}</td>
                      <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{formatDate(sale.date, lang)}</td>
                      <td className="px-5 py-3.5 font-medium text-[#0f1b35]">
                        {(sale.retailers as Retailer | undefined)?.name ?? retailers.find(r => r.id === sale.retailer_id)?.name ?? sale.customer_name ?? '—'}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500">
                        {sale.items.length} {tr.itemName.toLowerCase()}{sale.items.length !== 1 ? 's' : ''}
                        {sale.items.length > 0 && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({sale.items.map(i => i.name).join(', ').substring(0, 30)}{sale.items.map(i => i.name).join(', ').length > 30 ? '…' : ''})
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-[#0f1b35]">
                        {sale.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full border ${DELIVERY_COLORS[sale.delivery_status]}`}>
                          {deliveryLabel(sale.delivery_status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => printInvoice(sale)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors whitespace-nowrap">
                            {tr.printInvoice}
                          </button>
                          <button onClick={() => openEdit(sale)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-[#c9a84c] hover:text-[#c9a84c] transition-colors">
                            {tr.edit}
                          </button>
                          <button onClick={() => setShowDelete(sale)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-red-500 hover:border-red-400 hover:bg-red-50 transition-colors">
                            {tr.delete}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit sale modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingSale ? tr.editSale : tr.addSale}
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

          {/* Invoice number (readonly) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{tr.invoiceNumber}</label>
            <p className="px-3 py-2 bg-gray-50 rounded-lg text-sm font-mono text-gray-500 border border-gray-200">
              {form.invoice_number}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label={tr.date} type="date" value={form.date} onChange={e => setField('date', e.target.value)} required />
            <Select label={tr.linkRetailerLabel} value={form.retailer_id} onChange={e => setField('retailer_id', e.target.value)}>
              <option value="">—</option>
              {retailers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </div>

          <Select label={tr.linkOrderOpt} value={form.order_id} onChange={e => setField('order_id', e.target.value)}>
            <option value="">{tr.noOrder}</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
          </Select>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">{tr.saleItems}</label>
              <button onClick={addItem} className="text-xs text-[#c9a84c] hover:underline font-medium">
                + {tr.addItem}
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">{tr.itemName}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-16">{tr.saleQty}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-24">{tr.unitPrice}</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 w-24">{tr.subtotal}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {saleItems.map((item, i) => {
                    const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
                    return (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-1.5">
                          <input
                            value={item.name}
                            onChange={e => updateItem(i, 'name', e.target.value)}
                            placeholder="Product name…"
                            className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#0f1b35]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" min="0" step="0.01"
                            value={item.quantity}
                            onChange={e => updateItem(i, 'quantity', e.target.value)}
                            className="w-14 px-2 py-1 text-sm border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-[#0f1b35]"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number" min="0" step="0.01"
                            value={item.unit_price}
                            onChange={e => updateItem(i, 'unit_price', e.target.value)}
                            className="w-22 px-2 py-1 text-sm border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-[#0f1b35]"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums text-[#0f1b35]">
                          {lineTotal.toFixed(2)}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          {saleItems.length > 1 && (
                            <button onClick={() => removeItem(i)}
                              className="text-red-400 hover:text-red-600 text-lg leading-none">
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-gray-600">{tr.totalAmount}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-[#0f1b35]">{saleTotal.toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Delivery */}
          <div className="grid grid-cols-2 gap-3">
            <Select label={tr.deliveryStatusLabel} value={form.delivery_status} onChange={e => setField('delivery_status', e.target.value as DeliveryStatus)}>
              <option value="pending">{tr.pending}</option>
              <option value="out_for_delivery">{tr.outForDelivery}</option>
              <option value="delivered">{tr.delivered}</option>
              <option value="returned">{tr.returned}</option>
            </Select>
            <Input label={tr.deliveryDate} type="date" value={form.delivery_date} onChange={e => setField('delivery_date', e.target.value)} />
          </div>

          <Input label={tr.deliveryNotes} value={form.delivery_notes} onChange={e => setField('delivery_notes', e.target.value)} />
          <Textarea label={tr.notes} value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} />
        </div>
      </Modal>

      {/* Delete confirmation */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="font-semibold text-[#0f1b35] mb-2">{tr.delete} {showDelete.invoice_number}</h3>
            <p className="text-sm text-gray-500 mb-6">{tr.deleteConfirmSale}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowDelete(null)} disabled={deleting}>{tr.cancel}</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting}>{tr.delete}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
