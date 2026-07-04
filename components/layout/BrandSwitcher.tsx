'use client'
import { useState } from 'react'
import { useBrand } from '@/contexts/BrandContext'
import { useLang } from '@/contexts/LanguageContext'

export function BrandSwitcher() {
  const { brandId, brands, switchBrand, createBrand, renameBrand } = useBrand()
  const { tr } = useLang()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const current = brands.find(b => b.id === brandId)

  if (brands.length === 0) return null

  async function handleCreate() {
    if (!newName.trim()) return
    setBusy(true)
    await createBrand(newName.trim())
    setBusy(false)
  }

  async function saveRename() {
    if (editingId && editName.trim()) await renameBrand(editingId, editName.trim())
    setEditingId(null)
    setEditName('')
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
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setCreating(false); setEditingId(null) }} />
          <div className="absolute left-0 mt-1 w-64 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 text-[#0f1b35]">
            <p className="px-4 py-1.5 text-xs text-gray-400 uppercase tracking-wide">{tr.brand}</p>
            {brands.map(b => (
              editingId === b.id ? (
                <div key={b.id} className="px-3 py-2 flex items-center gap-2">
                  <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') { setEditingId(null); setEditName('') } }}
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm text-[#0f1b35] min-w-0" />
                  <button onClick={saveRename} className="text-[#0f1b35] text-sm font-semibold shrink-0">{tr.save}</button>
                </div>
              ) : (
                <div key={b.id} className={'w-full px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ' + (b.id === brandId ? 'font-semibold' : '')}>
                  <button onClick={() => switchBrand(b.id)} className="flex-1 text-left truncate min-w-0">{b.name}</button>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {b.id === brandId && <span className="text-[#c9a84c]">✓</span>}
                    <button onClick={() => { setEditingId(b.id); setEditName(b.name) }} title={tr.edit} className="text-gray-400 hover:text-[#0f1b35]">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                    </button>
                  </div>
                </div>
              )
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