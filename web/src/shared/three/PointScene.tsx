import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import type { SceneBuilder } from './scenes'

type Vec3 = [number, number, number]

type Props = {
  build: SceneBuilder
  camera: { position: Vec3; target: Vec3; fov?: number }
  /** How far the camera drifts on its own, in world units. */
  drift?: number
  /** How far the camera follows the pointer, in world units. */
  parallax?: number
  label: string
  className?: string
}

/**
 * Hosts one Three.js point-cloud scene: sizes it to its box, pauses it offscreen,
 * renders a single still frame under prefers-reduced-motion, and falls back to a
 * static dot field if WebGL cannot start.
 */
export function PointScene({ build, camera, drift = 0.35, parallax = 0.6, label, className = '' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
      if (!renderer.getContext()) throw new Error('no context')
    } catch {
      setFailed(true)
      return
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    renderer.setPixelRatio(pixelRatio)
    renderer.setClearColor(0x000000, 0)
    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.setAttribute('aria-hidden', 'true')
    host.appendChild(canvas)

    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(camera.fov ?? 38, 1, 0.1, 300)
    const base = new THREE.Vector3(...camera.position)
    const target = new THREE.Vector3(...camera.target)
    let built: ReturnType<SceneBuilder>
    try {
      built = build({ scene, pixelRatio })
    } catch {
      renderer.dispose()
      canvas.remove()
      setFailed(true)
      return
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    let visible = true
    let raf = 0
    const clock = new THREE.Clock()

    const render = (t: number) => {
      pointer.x += (pointer.tx - pointer.x) * 0.05
      pointer.y += (pointer.ty - pointer.y) * 0.05
      const dx = reduced ? 0 : Math.sin(t * 0.13) * drift + pointer.x * parallax
      const dy = reduced ? 0 : Math.sin(t * 0.09) * drift * 0.4 - pointer.y * parallax * 0.5
      cam.position.set(base.x + dx, base.y + dy, base.z)
      cam.lookAt(target)
      built.update(reduced ? 6 : t)
      renderer.render(scene, cam)
    }

    const loop = () => {
      render(clock.getElapsedTime())
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (reduced || raf || !visible || document.hidden) return
      clock.start()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      cam.aspect = w / h
      // Keep wide scenes framed on narrow screens by pulling the camera back.
      cam.fov = (camera.fov ?? 38) * (cam.aspect < 1 ? 1 + (1 - cam.aspect) * 0.6 : 1)
      cam.updateProjectionMatrix()
      if (reduced || !raf) render(clock.getElapsedTime())
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible) start()
        else stop()
      },
      { rootMargin: '80px' }
    )
    io.observe(host)

    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1
    }
    const onLeave = () => {
      pointer.tx = 0
      pointer.ty = 0
    }
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)

    const onLost = (e: Event) => {
      e.preventDefault()
      stop()
      setFailed(true)
    }
    canvas.addEventListener('webglcontextlost', onLost)

    start()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('webglcontextlost', onLost)
      scene.traverse((o) => {
        if (o instanceof THREE.Points) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
      renderer.dispose()
      canvas.remove()
    }
    // The scene is built once per mount; props are read at mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={hostRef} role="img" aria-label={label} className={`relative h-full w-full ${className}`}>
      {failed && (
        <div className="absolute inset-0 flex items-end bg-[radial-gradient(circle,_rgba(236,235,228,0.22)_1px,_transparent_1.5px)] bg-[length:14px_14px] p-4">
          <p className="font-mono text-[11px] text-bone-dim">3D view unavailable on this device — WebGL could not start.</p>
        </div>
      )}
    </div>
  )
}
