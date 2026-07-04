'use client'
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Brand { id: string; name: string }

interface BrandContextType {
  brandId: string | null
  brands: Brand[]
  loading: boolean
  setBrand: (id: string) => void
  createBrand: (name: string) => Promise<Brand | null>
  refreshBrands: () => Promise<void>
}

const BrandContext = createContext<BrandContextType>({
  brandId: null, brands: [], loading: true,
  setBrand: () => {}, createBrand: async () => null, refreshBrands: async () => {},
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
      let stored: string | null = null
      try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* ignore */ }
      const valid = stored && list.some(b => b.id === stored) ? stored : (list[0]?.id ?? null)
      setBrandId(valid)
    } catch {
      // brands table not created yet -> stay single-brand (null = no filtering)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  const setBrand = (id: string) => {
    setBrandId(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ }
  }

  const createBrand = async (name: string): Promise<Brand | null> => {
    const { data, error } = await supabase.from('brands').insert({ name }).select('id, name').single()
    if (error || !data) return null
    await load()
    setBrand((data as Brand).id)
    return data as Brand
  }

  const refreshBrands = async () => { await load() }

  return (
    <BrandContext.Provider value={{ brandId, brands, loading, setBrand, createBrand, refreshBrands }}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() { return useContext(BrandContext) }