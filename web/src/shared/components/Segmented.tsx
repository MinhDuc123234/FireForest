import React from 'react'

type Option<T extends string> = { value: T; label: string }

type Props<T extends string> = {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  label: string
  size?: 'sm' | 'md'
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full border border-line bg-ink-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap font-mono transition-colors duration-150 ${
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs'
            } ${active ? 'bg-bone text-ink' : 'text-bone-dim hover:text-bone'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
