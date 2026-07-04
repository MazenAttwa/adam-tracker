'use client'
import { useBrand } from '@/contexts/BrandContext'
import { useLang } from '@/contexts/LanguageContext'

export function BrandName() {
  const { brands, brandId } = useBrand()
  const { tr } = useLang()
  return <>{brands.find(b => b.id === brandId)?.name ?? tr.appName}</>
}