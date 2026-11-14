import React from 'react'

import { SiteNav } from './components/SiteNav'
import { Hero } from './components/Hero'
import { Methodology } from './components/Methodology'
import { Harmonization } from './components/Harmonization'
import { SeasonalTrends } from './components/SeasonalTrends'
import { ThermalFooter } from './components/ThermalFooter'

export const args = {
  titleLine1: 'Earth Fire &',
  titleLine2: 'Surface Intelligence',
}

export const argTypes = {
  titleLine1: { control: 'text' },
  titleLine2: { control: 'text' },
}

type Props = Partial<typeof args> & { onExploreDashboard?: () => void }

export default function Home(props: Props) {
  const { titleLine1, titleLine2, onExploreDashboard } = { ...args, ...props }
  return (
    <div className="bg-ink text-bone">
      <SiteNav onDashboard={onExploreDashboard} />
      <main>
        <Hero line1={titleLine1} line2={titleLine2} onExplore={onExploreDashboard} />
        <Methodology />
        <Harmonization />
        <SeasonalTrends />
      </main>
      <ThermalFooter onDashboard={onExploreDashboard} />
    </div>
  )
}
