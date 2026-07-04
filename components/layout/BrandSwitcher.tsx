'use client'
import { useState } from 'react'
import { useBrand } from '@/contexts/BrandContext'
import { useLang } from '@/contexts/LanguageContext'

export function BrandSwitcher() {
  const { brandId, brands, switchBrand, createBrand } = useBrand()
  const { tr } = useLang()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const current = brands.find(b => b.id === brandId)

  if (brands.length === 0) return null

  async function handleCreate() {
    if (!newName.trim()) return
    setBusy(true)
    await createBrand(newName.trim())
    setBusy(false)
  }

  return (
    <div className="relative shrink-0">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium text-white">
        <span className="w-2 h-2 rounded-full bg-[#c9a84c]" />
        <span className="max-w-[120px] truncate">{current?.name ?? tr.brand}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setCreating(false) }} />
          <div className="absolute left-0 mt-1 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 text-[#0f1b35]">
            <p className="px-4 py-1.5 text-xs text-gray-400 uppercase tracking-wide">{tr.brand}</p>
            {brands.map(b => (
              <button key={b.id} onClick={() => switchBrand(b.id)}
                className={'w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ' + (b.id === brandId ? 'font-semibold' : '')}>
                <span className="truncate">{b.name}</span>
                {b.id === brandId && <span className="text-[#c9a84c] ml-2">✓</span>}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              {!creating ? (
                <button onClick={() => setCreating(true)} className="w-full text-left px-4 py-2 text-sm text-[#c9a84c] hover:bg-gray-50 font-medium">+ {tr.newBrand}</button>
              ) : (
                <div className="px-3 py-2">
                  <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder={tr.brandName}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mb-2 text-[#0f1b35]" />
                  <button onClick={handleCreate} disabled={busy}
                    className="w-full bg-[#0f1b35] text-white text-sm rounded-lg py-1.5 disabled:opacity-50">{busy ? '...' : tr.create}</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}