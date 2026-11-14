/**
 * "Vietnam Fire Grid": the 10 km cells of grid_cells.json as instanced square columns.
 * Height and colour = harm (March fire-active cell-days) of the selected year, sqrt scale.
 * Plane coordinates follow the pipeline's sinusoidal grid: x = lon·cos(lat), y = lat (degrees),
 * so every cell is a true 10 × 10 km square.  Loaded with a dynamic import (three.js chunk).
 */
import * as THREE from 'three'

import { infernoRGB } from '../lib/colors'

export type GridInput = {
  /** [lat, lon] of each cell, in grid_cells.json order */
  cells: [number, number][]
  /** values[yearIndex][cellIndex] */
  values: number[][]
  vmax: number
  /** province rings as [lon, lat][] */
  rings: [number, number][][]
  /** cell edge in plane units (10 km / 111.195 km per degree) */
  cellSize: number
  /** named anchors whose screen position is reported every frame (for HTML labels) */
  anchors: Record<string, [number, number]>
}

export type FireGridScene = {
  setYear: (index: number, animate: boolean) => void
  setPaused: (paused: boolean) => void
  dispose: () => void
}

const HMAX = 1.5 // plane units for vmax
const EASE = (t: number) => 1 - Math.pow(1 - t, 3) // close to cubic-bezier(0.2, 0.8, 0.2, 1)
const GROW_MS = 600
const SWEEP_MS = 1400

export function createFireGrid(
  host: HTMLElement,
  data: GridInput,
  initialYear: number,
  onFrame: (anchors: Record<string, { x: number; y: number; visible: boolean }>, sweep: { x: number; y: number; on: boolean }) => void
): FireGridScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  if (!renderer.getContext()) throw new Error('WebGL unavailable')
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  const canvas = renderer.domElement
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.setAttribute('aria-hidden', 'true')
  host.appendChild(canvas)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200)

  // ---- projection (sinusoidal, centred on the mainland cells)
  const px = (lon: number, lat: number) => lon * Math.cos((lat * Math.PI) / 180)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [lat, lon] of data.cells) {
    const x = px(lon, lat)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, lat); maxY = Math.max(maxY, lat)
  }
  for (const [lon, lat] of Object.values(data.anchors)) {
    const x = px(lon, lat)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, lat); maxY = Math.max(maxY, lat)
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const toWorld = (lon: number, lat: number) => new THREE.Vector3(px(lon, lat) - cx, 0, -(lat - cy))
  const spanY = maxY - minY

  // ---- lights (Lambert shading so the column sides read in 3D)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4)
  sun.position.set(-4, 10, 6)
  scene.add(sun)

  // ---- columns
  const n = data.cells.length
  const geom = new THREE.BoxGeometry(data.cellSize * 0.84, 1, data.cellSize * 0.84)
  geom.translate(0, 0.5, 0)
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const mesh = new THREE.InstancedMesh(geom, mat, n)
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  const base = data.cells.map(([lat, lon]) => toWorld(lon, lat))
  const colorArr = new Float32Array(n * 3)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArr, 3)
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
  scene.add(mesh)

  const heightOf = (v: number) => (v > 0 ? 0.012 + Math.sqrt(Math.min(v, data.vmax) / data.vmax) * HMAX : 0.004)
  const colourOf = (v: number): [number, number, number] =>
    v > 0 ? infernoRGB(0.12 + 0.88 * Math.sqrt(Math.min(v, data.vmax) / data.vmax)) : [0.09, 0.08, 0.1]

  let from = new Float32Array(n)
  let to = new Float32Array(n)
  let fromC = new Float32Array(n * 3)
  let toC = new Float32Array(n * 3)
  const fill = (yi: number, h: Float32Array, c: Float32Array) => {
    const row = data.values[yi]
    for (let i = 0; i < n; i++) {
      h[i] = heightOf(row[i])
      const [r, g, b] = colourOf(row[i])
      c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b
    }
  }
  fill(initialYear, to, toC)
  from.set(to)
  fromC.set(toC)

  // ---- province outlines, flat on the plane
  const segs: number[] = []
  for (const ring of data.rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = toWorld(ring[i - 1][0], ring[i - 1][1])
      const b = toWorld(ring[i][0], ring[i][1])
      segs.push(a.x, 0.001, a.z, b.x, 0.001, b.z)
    }
  }
  const lineGeom = new THREE.BufferGeometry()
  lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3))
  const lines = new THREE.LineSegments(lineGeom, new THREE.LineBasicMaterial({ color: 0xecebe4, transparent: true, opacity: 0.16 }))
  scene.add(lines)

  // ---- sweep line (Aqua pass, south -> north)
  const sweepW = maxX - minX + 2
  const sweepGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-sweepW / 2, 0.02, 0), new THREE.Vector3(sweepW / 2, 0.02, 0)])
  const sweepMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
  const sweep = new THREE.Line(sweepGeom, sweepMat)
  scene.add(sweep)

  // ---- camera: tilted ~35 degrees from straight down (55 degrees above the horizon), slow azimuth drift
  // aim slightly north of centre so the shape sits below the caption block (top-left of the frame)
  const target = new THREE.Vector3(0, 0, -0.35)
  const ELEV = (55 * Math.PI) / 180
  let dist = 20
  const fit = () => {
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // fit the N-S extent (foreshortened) and the E-W extent
    const vfov = (camera.fov * Math.PI) / 180
    const needV = (spanY * Math.sin(ELEV) + HMAX * Math.cos(ELEV)) * 1.24
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
    const needH = (maxX - minX + 1.2) * 1.04
    dist = Math.max(needV / (2 * Math.tan(vfov / 2)), needH / (2 * Math.tan(hfov / 2)))
    camera.updateProjectionMatrix()
  }
  fit()
  const ro = new ResizeObserver(fit)
  ro.observe(host)

  // ---- animation state
  let t0 = performance.now()
  let sweepStart = -1
  let paused = false
  let raf = 0
  const m4 = new THREE.Matrix4()
  const tmp = new THREE.Vector3()
  const startTime = performance.now()

  const anchorWorld = Object.fromEntries(Object.entries(data.anchors).map(([k, [lon, lat]]) => [k, toWorld(lon, lat)]))

  const project = (v: THREE.Vector3) => {
    tmp.copy(v).project(camera)
    return { x: (tmp.x * 0.5 + 0.5) * host.clientWidth, y: (-tmp.y * 0.5 + 0.5) * host.clientHeight, visible: tmp.z < 1 }
  }

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    if (paused) return
    // camera drift: +/- 14 degrees over ~90 s
    const az = Math.sin(((now - startTime) / 90000) * Math.PI * 2) * ((14 * Math.PI) / 180)
    camera.position.set(Math.sin(az) * Math.cos(ELEV) * dist, Math.sin(ELEV) * dist, Math.cos(az) * Math.cos(ELEV) * dist)
    camera.lookAt(target)

    const k = Math.min(1, (now - t0) / GROW_MS)
    const e = EASE(k)
    // sweep position (world z), south (+z) to north (-z)
    let sz = Infinity
    let sOn = false
    if (sweepStart >= 0) {
      const s = (now - sweepStart) / SWEEP_MS
      if (s <= 1) {
        sz = spanY / 2 + 0.5 - s * (spanY + 1)
        sOn = true
        sweep.position.z = sz
        sweepMat.opacity = 0.85 * Math.sin(Math.PI * Math.min(1, s * 1.05))
      } else {
        sweepStart = -1
        sweepMat.opacity = 0
      }
    }
    const col = mesh.instanceColor!.array as Float32Array
    for (let i = 0; i < n; i++) {
      const h = from[i] + (to[i] - from[i]) * e
      const p = base[i]
      m4.makeScale(1, h, 1)
      m4.setPosition(p.x, 0, p.z)
      mesh.setMatrixAt(i, m4)
      let glow = 0
      if (sOn) {
        const d = (p.z - sz) / 0.45
        glow = Math.exp(-d * d) * 0.55
      }
      for (let c = 0; c < 3; c++) {
        const v = fromC[i * 3 + c] + (toC[i * 3 + c] - fromC[i * 3 + c]) * e
        col[i * 3 + c] = v + (1 - v) * glow
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
    renderer.render(scene, camera)

    const a: Record<string, { x: number; y: number; visible: boolean }> = {}
    for (const [key, v] of Object.entries(anchorWorld)) a[key] = project(v)
    const sp = sOn ? project(new THREE.Vector3(sweepW / 2 - 1, 0, sz)) : { x: 0, y: 0, visible: false }
    onFrame(a, { x: sp.x, y: sp.y, on: sOn })
  }
  raf = requestAnimationFrame(frame)

  return {
    setYear(index, animate) {
      // start from the current interpolated state so rapid changes stay smooth
      const k = EASE(Math.min(1, (performance.now() - t0) / GROW_MS))
      const curH = new Float32Array(n)
      const curC = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) curH[i] = from[i] + (to[i] - from[i]) * k
      for (let i = 0; i < n * 3; i++) curC[i] = fromC[i] + (toC[i] - fromC[i]) * k
      from = curH
      fromC = curC
      to = new Float32Array(n)
      toC = new Float32Array(n * 3)
      fill(index, to, toC)
      t0 = animate ? performance.now() : performance.now() - GROW_MS
      sweepStart = animate ? performance.now() : -1
    },
    setPaused(p) {
      paused = p
    },
    dispose() {
      cancelAnimationFrame(raf)
      ro.disconnect()
      geom.dispose()
      mat.dispose()
      lineGeom.dispose()
      sweepGeom.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
