export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatDate(dateStr: string, lang: 'en' | 'ar' = 'en'): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export function formatDateTime(dateStr: string, lang: 'en' | 'ar' = 'en'): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
