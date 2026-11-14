import { useEffect, useRef, useState } from 'react'

/** Measured content width of an element (charts draw at real pixel size, so text never scales down). */
export function useWidth<T extends HTMLElement = HTMLDivElement>(initial = 640, min = 280) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(min, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [min])
  return [ref, w] as const
}
