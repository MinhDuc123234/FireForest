import React from 'react'
import { Link, NavLink } from 'react-router-dom'

export const PAGES = [
  { label: 'Explore', to: '/explore' },
  { label: 'Method', to: '/method' },
  { label: 'Trust', to: '/trust' },
]

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="FireForest, home">
      <span className="relative grid h-6 w-6 place-items-center border border-bone/40">
        <span className="h-1.5 w-1.5 rounded-full bg-ember" />
      </span>
      <span className="whitespace-nowrap text-sm font-semibold tracking-tight">FireForest</span>
    </Link>
  )
}

/** `app`: the map application's bar (not sticky, no call-to-action: you are already on the map). */
export function SiteNav({ app = false }: { app?: boolean }) {
  return (
    <header className={`z-30 shrink-0 border-b border-line bg-ink/90 backdrop-blur ${app ? '' : 'sticky top-0'}`}>
      <div className={`flex h-14 items-center gap-3 px-4 sm:gap-6 ${app ? 'md:px-5' : 'mx-auto max-w-[1280px] px-5 md:px-10'}`}>
        <Logo />
        <nav aria-label="Pages" className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {PAGES.map((p) => (
            <NavLink
              key={p.to}
              to={p.to}
              className={({ isActive }) =>
                `relative whitespace-nowrap rounded px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-ink-3 hover:text-bone focus-visible:outline focus-visible:outline-1 focus-visible:outline-ember sm:px-3 ${
                  isActive ? 'text-bone' : 'text-bone-dim'
                } ${p.to === '/explore' && !app ? 'sm:hidden' : ''}`
              }
            >
              {({ isActive }) => (
                <>
                  {p.label}
                  {isActive && <span className="absolute inset-x-2 -bottom-[11px] h-px bg-bone sm:inset-x-3" aria-hidden />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {!app && (
          <Link
            to="/explore"
            className="hidden shrink-0 whitespace-nowrap bg-ember px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember sm:block"
          >
            Explore the map
          </Link>
        )}
      </div>
    </header>
  )
}
