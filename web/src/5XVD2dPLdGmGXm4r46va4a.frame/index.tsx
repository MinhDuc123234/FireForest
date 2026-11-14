import React from 'react'

import { SiteNav } from './components/SiteNav'
import { Hero } from './components/Hero'
import { Methodology } from './components/Methodology'
import { Harmonization } from './components/Harmonization'
import { SeasonalTrends } from './components/SeasonalTrends'
import { ApiAccess } from './components/ApiAccess'
import { ThermalFooter } from './components/ThermalFooter'

export const args = {
  titleLine1: 'Earth Fire &',
  titleLine2: 'Surface Intelligence',
  chartMode: 'compare',
  apiFormState: 'idle',
}

export const argTypes = {
  titleLine1: { control: 'text' },
  titleLine2: { control: 'text' },
  chartMode: { control: 'radio', options: ['raw', 'harmonized', 'compare'] },
  apiFormState: { control: 'radio', options: ['idle', 'submitted'] },
}

type Props = Partial<typeof args> & { onExploreDashboard?: () => void }

export default function Home(props: Props) {
  const { titleLine1, titleLine2, chartMode, apiFormState, onExploreDashboard } = { ...args, ...props }
  return (
    <div className="bg-ink text-bone">
      <SiteNav onDashboard={onExploreDashboard} />
      <main>
        <Hero line1={titleLine1} line2={titleLine2} onExplore={onExploreDashboard} />
        <Methodology />
        <Harmonization initialMode={chartMode as 'raw' | 'harmonized' | 'compare'} />
        <SeasonalTrends />
        <ApiAccess initialState={apiFormState as 'idle' | 'submitted'} />
      </main>
      <ThermalFooter onDashboard={onExploreDashboard} />
    </div>
  )
}
