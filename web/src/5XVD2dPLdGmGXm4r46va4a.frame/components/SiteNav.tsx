import React from 'react'

const LINKS = [
  { label: 'Harmonization', href: '#harmonization' },
  { label: 'Seasonal Trends', href: '#seasonal' },
  { label: 'Methodology', href: '#methodology' },
]

export function SiteNav({ onDashboard }: { onDashboard?: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-5 md:px-10">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <span className="relative grid h-6 w-6 place-items-center border border-bone/40">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          </span>
          <span className="whitespace-nowrap text-sm font-semibold tracking-tight">EFSI</span>
        </a>
        <nav aria-label="Primary" className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={onDashboard}
            className="whitespace-nowrap rounded px-3 py-1.5 text-sm text-bone transition-colors duration-150 hover:bg-ink-3"
          >
            Dashboard
          </button>
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hidden whitespace-nowrap rounded px-3 py-1.5 text-sm text-bone-dim transition-colors duration-150 hover:bg-ink-3 hover:text-bone sm:block"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <a
          href="#api"
          className="hidden shrink-0 whitespace-nowrap border border-bone/30 px-3 py-1.5 font-mono text-xs text-bone transition-colors duration-150 hover:border-ember hover:text-ember lg:block"
        >
          API access
        </a>
      </div>
      <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 sm:hidden">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="whitespace-nowrap rounded px-2.5 py-1 text-xs text-bone-dim">
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  )
}
