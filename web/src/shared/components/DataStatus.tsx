import React from 'react'

import { useData, type AnyFile, type FileData } from '../data/load'

/** A single value read from a data file; shows a small skeleton while loading. */
export function DataValue<F extends AnyFile>({ file, pick }: { file: F; pick: (data: FileData<F>) => React.ReactNode }) {
  const s = useData(file)
  if (s.status === 'ready') return <span className="whitespace-nowrap">{pick(s.data)}</span>
  if (s.status === 'error') return <span className="text-[#FFB020]">unavailable</span>
  return <span className="inline-block h-[1em] w-16 animate-pulse bg-bone/10 align-middle" aria-label="loading" />
}
