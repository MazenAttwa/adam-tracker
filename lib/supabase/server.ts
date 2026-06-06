import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const FALLBACK_URL = 'https://placeholder.supabase.co'
const FALLBACK_KEY = 'placeholder-anon-key'

function validUrl(u: string | undefined): boolean {
  return !!u && (u.startsWith('https://') || u.startsWith('http://'))
}

export async function createClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return createServerClient(
    validUrl(url) ? url! : FALLBACK_URL,
    key && key.length > 20 ? key : FALLBACK_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
