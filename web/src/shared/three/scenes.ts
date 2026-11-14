import * as THREE from 'three'

import { gauss, mulberry32 } from '../lib/random'
import {
  BONE,
  BONE_DIM,
  Cloud,
  EMBER,
  HOT,
  createUniforms,
  mixRGB,
  pointsMaterial,
  type SharedUniforms,
} from './cloud'

export type SceneContext = { scene: THREE.Scene; pixelRatio: number }
export type BuiltScene = { update: (t: number) => void }
export type SceneBuilder = (ctx: SceneContext) => BuiltScene

/* ---------- shared pieces ---------- */

type HeightFn = (x: number, z: number) => number

function addContours(
  cloud: Cloud,
  h: HeightFn,
  opts: { w: number; d: number; step: number; interval: number; keep: number; seed: number; fadeDepth?: boolean }
) {
  const rand = mulberry32(opts.seed)
  const { w, d, step, interval } = opts
  const e = 0.01
  for (let x = -w / 2; x <= w / 2; x += step) {
    for (let z = -d / 2; z <= d / 2; z += step) {
      const y = h(x, z)
      const gx = (h(x + e, z) - h(x - e, z)) / (2 * e)
      const gz = (h(x, z + e) - h(x, z - e)) / (2 * e)
      const g = Math.max(Math.hypot(gx, gz), 0.12)
      const level = Math.round(y / interval) * interval
      const dist = Math.abs(y - level) / g
      if (dist > step * 0.55 || rand() > opts.keep) continue
      const edge = Math.min(1, (w / 2 - Math.abs(x)) / 2.5, (d / 2 - Math.abs(z)) / 1.8)
      const depth = opts.fadeDepth ? 0.45 + 0.55 * ((z + d / 2) / d) : 1
      const lift = Math.min(1, Math.max(0, (y + 1.2) / 3))
      cloud.add(x, y, z, mixRGB(BONE_DIM, BONE, lift), 2.1, Math.max(0, edge) * depth)
    }
  }
}

function addTree(cloud: Cloud, rand: () => number, x: number, z: number, base: number, height: number, n: number) {
  const trunkTop = height * 0.38
  for (let i = 0; i < Math.max(6, n * 0.06); i++) {
    const t = rand()
    cloud.add(x + gauss(rand) * 0.03, base + t * trunkTop, z + gauss(rand) * 0.03, BONE_DIM, 1.6, 0.9)
  }
  const r = height * 0.32
  for (let i = 0; i < n; i++) {
    // Points inside an upward-tapering ellipsoid, biased toward its shell so the canopy reads as a volume.
    const u = rand() * 2 - 1
    const th = rand() * Math.PI * 2
    const shell = 0.65 + 0.35 * Math.sqrt(rand())
    const yy = u
    const taper = Math.sqrt(1 - u * u) * (1 - 0.35 * (u + 1) * 0.5)
    const px = Math.cos(th) * taper * r * shell
    const pz = Math.sin(th) * taper * r * shell
    const py = base + trunkTop + (yy + 1) * 0.5 * (height - trunkTop)
    cloud.add(x + px, py, z + pz, rand() > 0.85 ? BONE_DIM : BONE, 1.9, 0.95)
  }
}

function addHotspot(glow: Cloud, embers: Cloud, rand: () => number, x: number, y: number, z: number, scale = 1) {
  glow.add(x, y + 0.08, z, EMBER, 26 * scale, 0.75, rand())
  glow.add(x, y + 0.05, z, HOT, 9 * scale, 0.9, rand())
  for (let i = 0; i < 46 * scale; i++) {
    const a = rand() * Math.PI * 2
    const r = Math.abs(gauss(rand)) * 0.65 * scale
    const rise = rand() < 0.25 ? rand() * 1.1 * scale : 0
    embers.add(x + Math.cos(a) * r, y + 0.04 + rise, z + Math.sin(a) * r, rand() > 0.6 ? HOT : EMBER, 2.4, 1, rand() + 0.01)
  }
}

function finish(scene: THREE.Scene, group: THREE.Group, uniforms: SharedUniforms, clouds: [Cloud, boolean][]) {
  for (const [cloud, glow] of clouds) {
    if (cloud.count) group.add(cloud.build(pointsMaterial(uniforms, glow)))
  }
  scene.add(group)
}

/* ---------- 1. Hero: wide contour terrain ---------- */

const heroHeight: HeightFn = (x, z) =>
  0.85 * Math.sin(x * 0.3 + 0.6) * Math.cos(z * 0.42) +
  0.45 * Math.sin(x * 0.78 + z * 0.55) +
  0.22 * Math.cos(x * 1.6 - z * 1.05) +
  1.1 * Math.exp(-((x - 3.5) ** 2 + (z + 1.2) ** 2) / 7) -
  0.6 * Math.exp(-((x + 4) ** 2 + (z - 1.5) ** 2) / 9)

export const buildHeroScene: SceneBuilder = ({ scene, pixelRatio }) => {
  const uniforms = createUniforms(pixelRatio)
  const rand = mulberry32(11)
  const terrain = new Cloud()
  const trees = new Cloud()
  const glow = new Cloud()
  const embers = new Cloud()

  addContours(terrain, heroHeight, { w: 30, d: 15, step: 0.07, interval: 0.24, keep: 0.42, seed: 3, fadeDepth: true })

  const clusters: [number, number, number][] = [
    [-8.5, 1.5, 7],
    [-3.5, -2.8, 5],
    [1.2, 2.6, 8],
    [6.5, 0.4, 6],
    [9.8, -2.5, 4],
  ]
  for (const [cx, cz, count] of clusters) {
    for (let i = 0; i < count; i++) {
      const x = cx + gauss(rand) * 1.4
      const z = cz + gauss(rand) * 1.0
      addTree(trees, rand, x, z, heroHeight(x, z), 1.1 + rand() * 1.2, 110 + Math.floor(rand() * 90))
    }
  }

  const hotspots: [number, number, number][] = [
    [-1.2, 0.8, 1],
    [4.2, -1.6, 1.25],
    [8.2, 2.1, 0.8],
    [-6.2, -1.2, 0.7],
  ]
  for (const [x, z, s] of hotspots) addHotspot(glow, embers, rand, x, heroHeight(x, z), z, s)

  const group = new THREE.Group()
  finish(scene, group, uniforms, [
    [terrain, false],
    [trees, false],
    [embers, false],
    [glow, true],
  ])

  return {
    update(t) {
      uniforms.uTime.value = t
      group.rotation.y = Math.sin(t * 0.05) * 0.06
    },
  }
}

/* ---------- 2. Harmonization: tall scanned tree ---------- */

export const buildHarmonizationScene: SceneBuilder = ({ scene, pixelRatio }) => {
  const uniforms = createUniforms(pixelRatio)
  uniforms.uScan.value = 1
  const rand = mulberry32(27)
  const tree = new Cloud()
  const ground = new Cloud()
  const scan = new Cloud()

  // The tall tree: trunk, a few branches, layered canopy.
  for (let i = 0; i < 260; i++) {
    const y = rand() * 3.4
    const r = 0.16 * (1 - y / 4.5)
    const a = rand() * Math.PI * 2
    tree.add(Math.cos(a) * r, y, Math.sin(a) * r, BONE_DIM, 1.7, 0.95)
  }
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * Math.PI * 2 + rand()
    const y0 = 2.2 + rand() * 1.4
    for (let i = 0; i < 26; i++) {
      const t = i / 26
      tree.add(Math.cos(a) * t * 1.1, y0 + t * 0.9, Math.sin(a) * t * 1.1, BONE_DIM, 1.6, 0.9)
    }
  }
  for (let i = 0; i < 2600; i++) {
    const u = rand()
    const y = 2.6 + u * 4.2
    const maxR = 1.75 * Math.sin(Math.PI * Math.pow(u, 0.75)) + 0.15
    const r = maxR * (0.55 + 0.45 * Math.sqrt(rand()))
    const a = rand() * Math.PI * 2
    tree.add(Math.cos(a) * r, y, Math.sin(a) * r, rand() > 0.82 ? BONE_DIM : BONE, 1.9, 0.95)
  }

  // Smaller trees around it.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4
    const r = 3.1 + rand() * 1.0
    addTree(tree, rand, Math.cos(a) * r, Math.sin(a) * r, 0, 1.5 + rand() * 1.3, 220)
  }

  // Rings around the base, plus a sparse ground disc.
  for (const radius of [0.9, 1.7, 2.5, 3.4, 4.6]) {
    const n = Math.floor(radius * 46)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      ground.add(Math.cos(a) * radius, 0, Math.sin(a) * radius, radius === 1.7 ? EMBER : BONE_DIM, 1.8, 0.85)
    }
  }
  for (let i = 0; i < 700; i++) {
    const r = Math.sqrt(rand()) * 5.2
    const a = rand() * Math.PI * 2
    ground.add(Math.cos(a) * r, 0, Math.sin(a) * r, BONE_DIM, 1.3, 0.45)
  }

  // Scan plane outline: a dotted square that rides up and down.
  const half = 4.2
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * 2 - 1
    scan.add(t * half, 0, -half, EMBER, 1.7, 0.8)
    scan.add(t * half, 0, half, EMBER, 1.7, 0.8)
    scan.add(-half, 0, t * half, EMBER, 1.7, 0.8)
    scan.add(half, 0, t * half, EMBER, 1.7, 0.8)
  }

  const group = new THREE.Group()
  finish(scene, group, uniforms, [
    [ground, false],
    [tree, false],
  ])
  const scanPoints = scan.build(pointsMaterial(uniforms, false))
  scene.add(scanPoints)

  return {
    update(t) {
      uniforms.uTime.value = t
      group.rotation.y = t * 0.08
      // Slow sweep, bottom to top and back, ~14s per round trip.
      const y = 3.4 - Math.cos(t * 0.45) * 3.5
      uniforms.uScanY.value = y
      scanPoints.position.y = y
    },
  }
}

/* ---------- 3. Regional API: framed AOI terrain ---------- */

const regionHeight: HeightFn = (x, z) =>
  0.55 * Math.sin(x * 0.55 + 1.3) * Math.cos(z * 0.6 - 0.4) +
  0.35 * Math.cos(x * 1.1 + z * 0.8) +
  0.8 * Math.exp(-((x + 1.5) ** 2 + (z - 1) ** 2) / 4)

export const buildRegionScene: SceneBuilder = ({ scene, pixelRatio }) => {
  const uniforms = createUniforms(pixelRatio)
  const rand = mulberry32(53)
  const terrain = new Cloud()
  const trees = new Cloud()
  const glow = new Cloud()
  const embers = new Cloud()
  const frame = new Cloud()

  addContours(terrain, regionHeight, { w: 12, d: 12, step: 0.05, interval: 0.16, keep: 0.5, seed: 9 })

  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * 9.5
    const z = (rand() - 0.5) * 9.5
    if (Math.hypot(x - 1.8, z + 1.4) < 1.4) continue
    addTree(trees, rand, x, z, regionHeight(x, z), 0.8 + rand() * 1.0, 90 + Math.floor(rand() * 60))
  }

  for (const [x, z, s] of [
    [1.8, -1.4, 1.1],
    [-2.6, 2.4, 0.75],
    [3.4, 2.8, 0.6],
  ] as [number, number, number][]) {
    addHotspot(glow, embers, rand, x, regionHeight(x, z), z, s)
  }

  // Dotted area-of-interest box sitting on the terrain.
  const aoi = 2.4
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * 2 - 1
    const edges: [number, number][] = [
      [t * aoi + 1.8, -aoi - 1.4],
      [t * aoi + 1.8, aoi - 1.4],
      [-aoi + 1.8, t * aoi - 1.4],
      [aoi + 1.8, t * aoi - 1.4],
    ]
    for (const [x, z] of edges) frame.add(x, regionHeight(x, z) + 0.06, z, EMBER, 1.8, 0.9)
  }

  const group = new THREE.Group()
  finish(scene, group, uniforms, [
    [terrain, false],
    [frame, false],
    [trees, false],
    [embers, false],
    [glow, true],
  ])

  return {
    update(t) {
      uniforms.uTime.value = t
      group.rotation.y = -0.5 + t * 0.035
    },
  }
}
