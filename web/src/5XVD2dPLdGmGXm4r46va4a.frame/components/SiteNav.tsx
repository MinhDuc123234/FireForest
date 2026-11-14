import React from 'react'

/** Page sections, in page order. "Seasons" groups the seasonal calendar, the burning calendar and the 10 km map. */
export const SECTIONS = [
  { label: 'Story', href: '#story' },
  { label: 'Method', href: '#method' },
  { label: 'Seasons', href: '#seasons' },
  { label: 'Trust', href: '#trust' },
]

export function Logo() {
  return (
    <a href="#top" className="flex shrink-0 items-center gap-2.5" aria-label="FireForest, back to top">
      <span className="relative grid h-6 w-6 place-items-center border border-bone/40">
        <span className="h-1.5 w-1.5 rounded-full bg-ember" />
      </span>
      <span className="whitespace-nowrap text-sm font-semibold tracking-tight">FireForest</span>
    </a>
  )
}

export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-5 md:px-10">
        <Logo />
        <nav aria-label="Sections" className="ml-auto hidden items-center gap-1 sm:flex">
          {SECTIONS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded px-3 py-1.5 text-sm text-bone-dim transition-colors duration-150 hover:bg-ink-3 hover:text-bone focus-visible:outline focus-visible:outline-1 focus-visible:outline-ember"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
      <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 sm:hidden">
        {SECTIONS.map((l) => (
          <a key={l.href} href={l.href} className="whitespace-nowrap rounded px-2.5 py-1 text-xs text-bone-dim">
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  )
}
