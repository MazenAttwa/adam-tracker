'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import { Navbar } from '@/components/layout/Navbar'
import { BrandName } from '@/components/layout/BrandName'

interface AuditEntry {
  id: string
  created_at: string
  user_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: string | null
}

export default function AuditPage() {
  const { profile, loading } = useAuth()
  const { tr, lang } = useLang()
  const router = useRouter()
  const supabase = createClient()
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!profile) { router.push('/login'); return }
    if (profile.role !== 'manager') { router.push('/dashboard'); return }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, profile])

  async function fetchData() {
    const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(500)
    setRows((data ?? []) as AuditEntry[])
    setFetching(false)
  }

  const actionColor = (a: string) =>
    a === 'delete' ? 'text-red-600 bg-red-50'
    : a === 'edit' ? 'text-amber-600 bg-amber-50'
    : a === 'adjust' ? 'text-purple-600 bg-purple-50'
    : a === 'duplicate' ? 'text-teal-600 bg-teal-50'
    : 'text-blue-600 bg-blue-50'

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
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-[#0f1b35] mb-1">{tr.auditLog}</h1>
        <p className="text-gray-500 mb-6"><BrandName /></p>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-5 py-3 font-medium text-gray-600 whitespace-nowrap">{tr.date}</th>
                  <th className="px-5 py-3 font-medium text-gray-600">{tr.user}</th>
                  <th className="px-5 py-3 font-medium text-gray-600">{tr.action}</th>
                  <th className="px-5 py-3 font-medium text-gray-600">{tr.details}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</td>
                    <td className="px-5 py-3 text-gray-700">{r.user_email ?? '-'}</td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${actionColor(r.action)}`}>{r.action}</span>
                      <span className="text-gray-400 text-xs ml-1">{r.entity_type}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{r.details ?? r.entity_id ?? '-'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-gray-400">{tr.noReportData}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}