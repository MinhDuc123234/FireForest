import React from 'react'

export function ThermalFooter({ onDashboard }: { onDashboard?: () => void }) {
  return (
    <footer className="relative overflow-hidden border-t border-line">
      <img
        src="https://cdn.magicpatterns.com/patterns/generated-images/c5380b4b-7208-4a1e-ad26-ae029d723b8d.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-bottom opacity-60"
      />
      <div className="absolute inset-0 bg-ink/55" aria-hidden />
      <div className="relative mx-auto max-w-[1280px] px-5 pb-10 pt-32 md:px-10 md:pt-48">
        <p className="max-w-4xl text-[clamp(2.5rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.04em] text-bone">
          Read the fire season before it starts.
        </p>
        <button
          type="button"
          onClick={onDashboard}
          className="mt-10 whitespace-nowrap bg-bone px-5 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-ember"
        >
          Open the dashboard
        </button>

        <div className="mt-24 grid gap-8 border-t border-bone/20 pt-6 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <p className="max-w-md text-bone-dim">
            Earth Fire &amp; Surface Intelligence — a NASA Space Apps Challenge project. Detections shown are a
            demo dataset modeled on NASA FIRMS MODIS and VIIRS products.
          </p>
          <ul className="space-y-2">
            <li><a href="#harmonization" className="text-bone-dim hover:text-bone">Harmonization</a></li>
            <li><a href="#seasonal" className="text-bone-dim hover:text-bone">Seasonal Trends</a></li>
            <li><a href="#methodology" className="text-bone-dim hover:text-bone">Methodology</a></li>
          </ul>
          <ul className="space-y-2 font-mono text-[11px] text-bone-dim">
            <li>10.71°N / 105.52°E</li>
            <li>Đồng Tháp, Vietnam</li>
            <li>Space Apps 2025</li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
