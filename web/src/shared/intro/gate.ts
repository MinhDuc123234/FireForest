import type { CameraOptions, Map as MLMap } from 'maplibre-gl'

/**
 * Home intro gate (main bundle, no heavy imports). The intro itself (three.js flame, globe timeline)
 * lives in ./Intro and is loaded with a dynamic import only when it will play.
 */
const KEY = 'hotspot:intro-seen'

/** First visit of the session, motion allowed and WebGL available. */
export function shouldPlayIntro(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (sessionStorage.getItem(KEY)) return false
  } catch {
    // storage blocked: play it, it simply plays again next time
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    const c = document.createElement('canvas')
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) return false
  } catch {
    return false
  }
  return true
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    // ignore
  }
}

/** What the hero map hands to the intro once its style is ready: the live map, the hero camera, and a way to give control back. */
export type IntroHandoff = {
  map: MLMap
  /** the hero's final camera (the intro must end exactly here) */
  target: CameraOptions
  /** restore mercator, show the 10 km squares and let them grow; `jump` snaps the camera to `target` first */
  finish: (jump: boolean) => void
}

/** Shared between the hero (Skip button, map) and the lazily loaded intro. */
export class IntroCtl {
  private resolve!: (h: IntroHandoff | null) => void
  readonly handoff: Promise<IntroHandoff | null> = new Promise((r) => (this.resolve = r))
  private ended = false
  private received: IntroHandoff | null = null
  /** set by the intro while it runs */
  abort: (() => void) | null = null

  get done() {
    return this.ended
  }

  /** called by the map; null when the map could not be created */
  give(h: IntroHandoff | null) {
    this.received = h
    if (this.ended) h?.finish(true)
    else this.resolve(h)
  }

  /** end now, from anywhere (Skip button, failure, timeout) */
  skip() {
    if (this.ended) return
    if (this.abort) {
      this.abort()
      return
    }
    this.ended = true
    this.received?.finish(true)
  }

  /** the intro reports that it has handed the camera back */
  end() {
    this.ended = true
    this.abort = null
  }
}
