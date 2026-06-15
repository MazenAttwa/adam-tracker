'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLang } from '@/contexts/LanguageContext'

interface FinishingType {
  id: string
  name: string
}

interface FinishingTypeSelectProps {
  value: string
  onChange: (name: string) => void
  disabled?: boolean
  label?: string
}

export function FinishingTypeSelect({
  value,
  onChange,
  disabled,
  label,
}: FinishingTypeSelectProps) {
  const { tr } = useLang()
  const [types, setTypes] = useState<FinishingType[]>([])
  const [inputVal, setInputVal] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Map legacy stored codes to readable labels
  function displayValue(v: string): string {
    if (v === 'machine') return tr.finishingTypes.machine
    if (v === 'hand') return tr.finishingTypes.hand
    return v
  }

  // Sync external value -> input
  useEffect(() => { setInputVal(displayValue(value ?? '')) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTypes() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('finishing_types')
      .select('id, name')
      .order('name')
    if (!error && data && data.length > 0) {
      setTypes(data as FinishingType[])
    } else {
      // Fallback if the table does not exist yet
      setTypes([
        { id: 'machine', name: tr.finishingTypes.machine },
        { id: 'hand', name: tr.finishingTypes.hand },
      ])
    }
  }

  useEffect(() => { loadTypes() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const filtered = types.filter(t =>
    t.name.toLowerCase().includes(inputVal.toLowerCase())
  )
  const exactMatch = types.some(
    t => t.name.toLowerCase() === inputVal.toLowerCase()
  )

  function selectType(t: FinishingType) {
    setInputVal(t.name)
    onChange(t.name)
    setOpen(false)
  }

  async function addNewType() {
    const name = inputVal.trim()
    if (!name) return
    onChange(name)
    setOpen(false)
    const supabase = createClient()
    const { error } = await supabase.from('finishing_types').insert({ name })
    if (!error) loadTypes()
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setInputVal(e.target.value)
    onChange(e.target.value)
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
        placeholder={tr.searchFinishingType}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#0f1b35]
                   disabled:bg-gray-50 disabled:text-gray-400"
      />
      {open && !disabled && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200
                        rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(t => (
            <button
              key={t.id}
              type="button"
              onMouseDown={() => selectType(t)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              <span className="font-medium text-[#0f1b35]">{t.name}</span>
            </button>
          ))}
          {!exactMatch && inputVal.trim() !== '' && (
            <button
              type="button"
              onMouseDown={addNewType}
              className="w-full text-left px-3 py-2 text-sm text-[#c9a84c] hover:bg-amber-50
                         border-t border-gray-100 transition-colors font-medium"
            >
              + {tr.addNewFinishingType}: &ldquo;{inputVal.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
