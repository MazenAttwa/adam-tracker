import { cn } from '@/lib/utils'
import { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <input
        className={cn(
          'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-[#0f1b35] focus:border-transparent',
          'placeholder:text-gray-400 transition-colors bg-white',
          error && 'border-red-400 focus:ring-red-400',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <textarea
        rows={3}
        className={cn(
          'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm resize-none',
          'focus:outline-none focus:ring-2 focus:ring-[#0f1b35] focus:border-transparent',
          'placeholder:text-gray-400 transition-colors bg-white',
          error && 'border-red-400 focus:ring-red-400',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export function Select({ label, error, className, children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">{label}</label>
      )}
      <select
        className={cn(
          'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-[#0f1b35] focus:border-transparent',
          'bg-white transition-colors',
          error && 'border-red-400 focus:ring-red-400',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        className={cn(
          'w-4 h-4 rounded border-gray-300 text-[#0f1b35]',
          'focus:ring-[#0f1b35] cursor-pointer',
          className
        )}
        {...props}
      />
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  )
}
