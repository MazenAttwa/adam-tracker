'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { BrandName } from '@/components/layout/BrandName'
import { Button } from '@/components/ui/Button'

const TABLES = [
  'orders', 'stage_data', 'materials', 'material_photos', 'order_materials',
  'stock_movements', 'manufacturers', 'finishing_manufacturers', 'vendors',
  'vendor_transactions', 'expenses', 'revenue', 'month_closes', 'retailers',
  'sales', 'order_photos', 'production_lines', 'production_assignments', 'profiles',
]

export default function BackupPage() {
  const { profile, loading } = useAuth()
  const { tr } = useLang()
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
  }, [loading, profile, router])

  async function exportBackup() {
    setBusy(true)
    setStatus('')
    const backup: Record<string, unknown> = {
      _app: 'Adam Store',
      _exportedAt: new Date().toISOString(),
    }
    let ok = 0
    let rows = 0
    for (const table of TABLES) {
      try {
        const { data, error } = await supabase.from(table).select('*')
        if (!error) {
          backup[table] = data ?? []
          rows += (data ?? []).length
          ok++
        } else {
          backup[table] = { _error: error.message }
        }
      } catch (e) {
        backup[table] = { _error: String(e) }
      }
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `adam-store-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setStatus(`${tr.backupDone} (${ok} tables, ${rows} records)`)
    setBusy(false)
  }

  if (loading) {
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#0f1b35] mb-1">{tr.backup}</h1>
        <p className="text-gray-500 mb-6"><BrandName /></p>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <p className="text-gray-700 mb-5 leading-relaxed">{tr.backupDesc}</p>
          <Button onClick={exportBackup} loading={busy}>{tr.exportBackup}</Button>
          {status && <p className="mt-4 text-sm text-green-700 font-medium">{status}</p>}
          <p className="mt-6 text-xs text-gray-400 leading-relaxed">{tr.backupNote}</p>
        </div>
      </div>
    </div>
  )
}