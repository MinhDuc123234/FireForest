import React from 'react'

import { ScanFrame } from './ScanFrame'
import { dataUrl, useData, type AnyFile, type FileData } from '../data/load'

/**
 * Placeholder used while a view is being rebuilt on real data: shows, for each JSON file the
 * view will draw from, whether it loaded and a one-line description read from the file itself.
 */
export function DataPending({
  title,
  note,
  className = '',
  children,
}: {
  title: string
  note: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <ScanFrame tone="border-bone/40" size="sm" className={`bg-ink-2/40 p-5 ${className}`}>
      <div className="flex h-full flex-col">
        <h3 className="text-sm font-medium text-bone">{title}</h3>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">{note}</p>
        <ul className="mt-4 space-y-2 border-t border-line pt-3">{children}</ul>
      </div>
    </ScanFrame>
  )
}

export function FileStatus<F extends AnyFile>({
  file,
  summary,
}: {
  file: F
  summary: (data: FileData<F>) => string
}) {
  const s = useData(file)
  const dot = s.status === 'ready' ? 'bg-[#3BC9DB]' : s.status === 'error' ? 'bg-[#FFB020]' : 'bg-bone/30 animate-pulse'
  return (
    <li className="grid grid-cols-[10px_minmax(0,1fr)] items-baseline gap-x-2 font-mono text-[11px]">
      <span aria-hidden className={`h-1.5 w-1.5 translate-y-[-1px] rounded-full ${dot}`} />
      <span className="min-w-0">
        <a href={dataUrl(file)} className="text-bone-dim underline-offset-2 hover:text-bone hover:underline">
          {file}
        </a>
        <span className="text-muted"> · </span>
        {s.status === 'ready' && <span className="text-bone">{summary(s.data)}</span>}
        {s.status === 'loading' && <span className="text-muted">loading</span>}
        {s.status === 'error' && <span className="text-[#FFB020]">failed: {s.error.message}</span>}
      </span>
    </li>
  )
}

/** A single value read from a data file; shows a dash while loading. */
export function DataValue<F extends AnyFile>({ file, pick }: { file: F; pick: (data: FileData<F>) => React.ReactNode }) {
  const s = useData(file)
  if (s.status === 'ready') return <>{pick(s.data)}</>
  if (s.status === 'error') return <span className="text-[#FFB020]">unavailable</span>
  return <span className="inline-block h-[1em] w-16 animate-pulse bg-bone/10 align-middle" aria-label="loading" />
}
