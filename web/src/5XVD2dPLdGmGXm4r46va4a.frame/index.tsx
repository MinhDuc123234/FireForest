import React from 'react'

import { Hero } from './components/Hero'
import { Harmonization } from './components/Harmonization'
import { SeasonalTrends } from './components/SeasonalTrends'
import { TrustTeaser } from './components/TrustTeaser'
import { usePageMeta } from '../shared/lib/usePageMeta'

export const args = {
  title: 'FireForest',
  subtitle: 'One comparable fire history, many local decisions.',
}

export const argTypes = {
  title: { control: 'text' },
  subtitle: { control: 'text' },
}

type Props = Partial<typeof args>

/**
 * Home: five screens, plain language. Hero map · the 2012 jump · where and when · why trust it ·
 * fire stripes + footer (the footer is part of the page shell).
 */
export default function Home(props: Props) {
  const { title, subtitle } = { ...args, ...props }
  usePageMeta(
    'FireForest · One comparable fire history for Vietnam',
    'Two NASA sensors, MODIS and VIIRS, joined into one comparable record of fire activity in Vietnam from 2003 to today.'
  )
  return (
    <>
      <Hero title={title} subtitle={subtitle} />
      <Harmonization />
      <SeasonalTrends />
      <TrustTeaser />
    </>
  )
}
