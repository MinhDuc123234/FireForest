import React from 'react'

type Props = {
  children?: React.ReactNode
  className?: string
  /** Corner color class, e.g. "border-bone/60" or "border-ember". */
  tone?: string
  size?: 'sm' | 'md'
}

/** Thin L-shaped corner marks around a viewport, like a sensor's scan window. */
export function ScanFrame({ children, className = '', tone = 'border-bone/50', size = 'md' }: Props) {
  const s = size === 'sm' ? 'h-3 w-3' : 'h-5 w-5'
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className={`pointer-events-none absolute left-0 top-0 z-10 border-l border-t ${s} ${tone}`} />
      <span aria-hidden className={`pointer-events-none absolute right-0 top-0 z-10 border-r border-t ${s} ${tone}`} />
      <span aria-hidden className={`pointer-events-none absolute bottom-0 left-0 z-10 border-b border-l ${s} ${tone}`} />
      <span aria-hidden className={`pointer-events-none absolute bottom-0 right-0 z-10 border-b border-r ${s} ${tone}`} />
      {children}
    </div>
  )
}
