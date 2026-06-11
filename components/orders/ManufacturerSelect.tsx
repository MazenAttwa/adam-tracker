'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLang } from '@/contexts/LanguageContext'
import type { Manufacturer, ManufacturerSpeciality } from '@/lib/types'

interface ManufacturerSelectProps {
  value: string          // manufacturer name (stored in stage data)
  onChange: (name: string, id?: string) => void
  disabled?: boolean
  label?: string
  filterSpeciality?: ManufacturerSpeciality
}

export function ManufacturerSelect({
  value,
  onChange,
  disabled,
  label,
  filterSpeciality,
}: ManufacturerSelectProps) {
  const { tr } = useLang()
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [inputVal, setInputVal] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external value → input
  useEffect(() => { setInputVal(value ?? '') }, [value])

  useEffect(() => {
    const supabase = createClient()
    let q = supabase.from('manufacturers').select('*').order('name')
    if (filterSpeciality) {
      q = q.or(`speciality.eq.${filterSpeciality},speciality.eq.all`)
    }
    q.then(({ data }) => setManufacturers((data ?? []) as Manufacturer[]))
  }, [filterSpeciality])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = manufacturers.filter(m =>
    m.name.toLowerCase().includes(inputVal.toLowerCase())
  )
  const exactMatch = manufacturers.some(
    m => m.name.toLowerCase() === inputVal.toLowerCase()
  )

  function selectManufacturer(m: Manufacturer) {
    setInputVal(m.name)
    onChange(m.name, m.id)
    setOpen(false)
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setInputVal(e.target.value)
    onChange(e.target.value, undefined)
    setOpen(true)
  }

  function handleBlur() {
    // small delay so click on dropdown item fires first
    setTimeout(() => setOpen(false), 150)
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      )}
      <input
        type="text"
        value={inputVal}
        onChange={handleInput}
        onFocus={() => !disabled && setOpen(true)}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={tr.searchManufacturer}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#0f1b35]
                   disabled:bg-gray-50 disabled:text-gray-400"
      />
      {open && !disabled && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200
                        rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(m => (
            <button
              key={m.id}
              type="button"
              onMouseDown={() => selectManufacturer(m)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium text-[#0f1b35]">{m.name}</span>
              {m.speciality && (
                <span className="ml-2 text-xs text-gray-400 capitalize">{m.speciality}</span>
              )}
            </button>
          ))}
          {!exactMatch && inputVal.trim() !== '' && (
            <button
              type="button"
              onMouseDown={() => {
                onChange(inputVal.trim(), undefined)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-2 text-sm text-[#c9a84c] hover:bg-amber-50
                         border-t border-gray-100 transition-colors font-medium"
            >
              + {tr.addNewManufacturer}: &ldquo;{inputVal.trim()}&rdquo;
            </button>
          )}
          {filtered.length === 0 && inputVal.trim() === '' && (
            <p className="px-3 py-2 text-xs text-gray-400">{tr.noManufacturers}</p>
          )}
        </div>
      )}
    </div>
  )
}
