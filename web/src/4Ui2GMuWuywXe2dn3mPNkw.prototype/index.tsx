import React, { useEffect } from 'react'
import { HashRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import Home from '../5XVD2dPLdGmGXm4r46va4a.frame'
import MethodPage from '../5XVD2dPLdGmGXm4r46va4a.frame/MethodPage'
import TrustPage from '../5XVD2dPLdGmGXm4r46va4a.frame/TrustPage'
import { SiteNav } from '../5XVD2dPLdGmGXm4r46va4a.frame/components/SiteNav'
import { ThermalFooter } from '../5XVD2dPLdGmGXm4r46va4a.frame/components/ThermalFooter'
import Explore from '../rS5HFe6F43Cdx79ZgRo2V1.frame'

/** The size every frame draws at, unless one exports its own. */
export const viewport = 'web'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** Reading pages: nav on top, footer below. */
function Reading() {
  return (
    <div className="bg-ink text-bone">
      <SiteNav />
      <main>
        <Outlet />
      </main>
      <ThermalFooter />
    </div>
  )
}

/**
 * Four pages behind a hash router (#/explore, #/method, #/trust): any static host serves
 * index.html for every route, so a refresh can never 404.
 */
export default function FireForest() {
  return (
    <HashRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<Reading />}>
          <Route path="/" element={<Home />} />
          <Route path="/method" element={<MethodPage />} />
          <Route path="/trust" element={<TrustPage />} />
          <Route path="*" element={<Home />} />
        </Route>
        <Route path="/explore" element={<Explore />} />
      </Routes>
    </HashRouter>
  )
}
