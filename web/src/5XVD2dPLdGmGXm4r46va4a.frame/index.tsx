import React from 'react'

import { SiteNav } from './components/SiteNav'
import { Hero } from './components/Hero'
import { Methodology } from './components/Methodology'
import { HarmonizedMap } from './components/HarmonizedMap'
import { BurningCalendar } from './components/BurningCalendar'
import { ThermalFooter } from './components/ThermalFooter'
import { FireStripes } from '../shared/components/FireStripes'

export const args = {
  title: 'FireForest',
  subtitle: 'One comparable fire history, many local decisions.',
}

export const argTypes = {
  title: { control: 'text' },
  subtitle: { control: 'text' },
}

type Props = Partial<typeof args> & { onExploreDashboard?: () => void }

/**
 * Page order follows the nav. Only finished sections are rendered: nothing unfinished is ever shown.
 * (The Explorer frame is not linked until it is built.)
 */
export default function Home(props: Props) {
  const { title, subtitle } = { ...args, ...props }
  return (
    <div className="bg-ink text-bone">
      <SiteNav />
      <main>
        <Hero title={title} subtitle={subtitle} />
        <div className="mx-auto max-w-[1280px] px-5 pt-16 md:px-10">
          <FireStripes />
        </div>
        <Methodology />
        <div id="seasons" className="scroll-mt-20">
          <BurningCalendar />
          <HarmonizedMap />
        </div>
      </main>
      <ThermalFooter />
    </div>
  )
}
