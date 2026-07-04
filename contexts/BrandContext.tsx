'use client'
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Brand { id: string; name: string }

interface BrandContextType {
  brandId: string | null
  brands: Brand[]
  loading: boolean
  switchBrand: (id: string) => Promise<void>
  createBrand: (name: string) => Promise<Brand | null>
  renameBrand: (id: string, name: string) => Promise<boolean>
}

const BrandContext = createContext<BrandContextType>({
  brandId: null, brands: [], loading: true,
  switchBrand: async () => {}, createBrand: async () => null, renameBrand: async () => false,
})

const STORAGE_KEY = 'adam_brand_id'

export function BrandProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [brands, setBrands] = useState<Brand[]>([])
  const [brandId, setBrandId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('brands').select('id, name').order('created_at')
      if (error || !data) { setLoading(false); return }
      const list = data as Brand[]
      setBrands(list)
      // source of truth for the selection: user_brand_selection, then localStorage, then first brand
      let selected: string | null = null
      try {
        const { data: u } = await supabase.auth.getUser()
        if (u?.user) {
          const { data: sel } = await supabase.from('user_brand_selection').select('brand_id').eq('user_id', u.user.id).maybeSingle()
          if (sel && (sel as { brand_id: string }).brand_id) selected = (sel as { brand_id: string }).brand_id
        }
      } catch { /* table may not exist yet */ }
      if (!selected) {
        try { const s = localStorage.getItem(STORAGE_KEY); if (s) selected = s } catch { /* ignore */ }
      }
      const valid = selected && list.some(b => b.id === selected) ? selected : (list[0]?.id ?? null)
      setBrandId(valid)
    } catch {
      // brands table not created yet -> single-brand mode
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  const persistSelection = async (id: string) => {
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ }
    try {
      const { data: u } = await supabase.auth.getUser()
      if (u?.user) {
        await supabase.from('user_brand_selection').upsert({ user_id: u.user.id, brand_id: id }, { onConflict: 'user_id' })
      }
    } catch { /* table may not exist yet */ }
  }

  const switchBrand = async (id: string) => {
    if (id === brandId) return
    await persistSelection(id)
    // reload so every screen refetches under the new brand
    window.location.reload()
  }

  const createBrand = async (name: string): Promise<Brand | null> => {
    const { data, error } = await supabase.from('brands').insert({ name }).select('id, name').single()
    if (error || !data) return null
    const b = data as Brand
    await persistSelection(b.id)
    window.location.reload()
    return b
  }

  const renameBrand = async (id: string, name: string): Promise<boolean> => {
    const { error } = await supabase.from('brands').update({ name }).eq('id', id)
    if (error) return false
    setBrands(prev => prev.map(b => (b.id === id ? { ...b, name } : b)))
    return true
  }

  return (
    <BrandContext.Provider value={{ brandId, brands, loading, switchBrand, createBrand, renameBrand }}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() { return useContext(BrandContext) }