import React from 'react'

import { SiteNav } from './components/SiteNav'
import { Hero } from './components/Hero'
import { Methodology } from './components/Methodology'
import { Harmonization } from './components/Harmonization'
import { HarmonizedMap } from './components/HarmonizedMap'
import { BurningCalendar } from './components/BurningCalendar'
import { SeasonalTrends } from './components/SeasonalTrends'
import { TrustLimits } from './components/TrustLimits'
import { ThermalFooter } from './components/ThermalFooter'

export const args = {
  title: 'FireForest',
  subtitle: 'One comparable fire history, many local decisions.',
}

export const argTypes = {
  title: { control: 'text' },
  subtitle: { control: 'text' },
}

type Props = Partial<typeof args> & { onExploreDashboard?: () => void }

/** Page order follows the nav: Story · Method · Seasons (seasonal, burning calendar, 10 km map) · Trust. */
export default function Home(props: Props) {
  const { title, subtitle, onExploreDashboard } = { ...args, ...props }
  return (
    <div className="bg-ink text-bone">
      <SiteNav onDashboard={onExploreDashboard} />
      <main>
        <Hero title={title} subtitle={subtitle} onExplore={onExploreDashboard} />
        <Harmonization />
        <Methodology />
        <SeasonalTrends />
        <BurningCalendar />
        <HarmonizedMap />
        <TrustLimits />
      </main>
      <ThermalFooter onDashboard={onExploreDashboard} />
    </div>
  )
}
