import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface CustomSelectProps {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Seçiniz...',
  disabled = false,
  className = '',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOption = options.find(opt => opt.value === value)

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-left focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb] outline-none transition-all ${
          disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50/50'
        }`}
      >
        <span className={`truncate ${selectedOption ? 'text-[#0f172a] font-medium' : 'text-gray-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-[#94a3b8] transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#e2e8f0] bg-white py-1 shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 italic text-center">Seçenek yok</div>
          ) : (
            options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#f1f5f9] transition-colors ${
                  opt.value === value ? 'bg-[#f1f5f9] text-[#2563eb] font-semibold' : 'text-[#0f172a]'
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
