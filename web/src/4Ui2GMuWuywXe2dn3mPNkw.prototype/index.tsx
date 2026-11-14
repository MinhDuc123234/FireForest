import React, { useState } from 'react'

import Home from '../5XVD2dPLdGmGXm4r46va4a.frame'
import Dashboard from '../rS5HFe6F43Cdx79ZgRo2V1.frame'

const HOME = '5XVD2dPLdGmGXm4r46va4a'
const DASHBOARD = 'rS5HFe6F43Cdx79ZgRo2V1'

/** The size every frame draws at, unless one exports its own. */
export const viewport = 'web'

type Props = { start?: string }

export default function EarthFireIntelligence(props: Props) {
  const [screen, setScreen] = useState(() => props.start ?? HOME)

  if (screen === DASHBOARD) {
    return <Dashboard onBack={() => setScreen(HOME)} />
  }
  return <Home onExploreDashboard={() => setScreen(DASHBOARD)} />
}
