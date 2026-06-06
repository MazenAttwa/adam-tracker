import { createBrowserClient } from '@supabase/ssr'

const FALLBACK_URL = 'https://placeholder.supabase.co'
const FALLBACK_KEY = 'placeholder-anon-key'

function validUrl(u: string | undefined): boolean {
  return !!u && (u.startsWith('https://') || u.startsWith('http://'))
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return createBrowserClient(
    validUrl(url) ? url! : FALLBACK_URL,
    key && key.length > 20 ? key : FALLBACK_KEY
  )
}
