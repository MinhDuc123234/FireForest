import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/*
 * The intro's fire, written for this site. A full-screen quad draws the flame from domain-warped fBm of
 * 3D gradient noise (quintic, C2 interpolation; integer hash), advected upward over time; heat maps to
 * #FFF6D8 -> #FFE08A -> #F28C28 -> #C8371F -> dark smoke. Embers are Points simulated on the CPU.
 * Output is on black and is meant for `mix-blend-mode: screen`, so it can sit over the live map.
 * Coordinates are CSS pixels of the canvas, y down (same as maplibre's map.project).
 */

/** Seconds from the first frame. */
export const T = {
  dieFrom: 1.5, // flame goes out
  dieTo: 1.85,
  zoomTo: 2.2, // camera pulls back 1.5 -> 2.2
  landFrom: 1.9, // embers travel to real fire points on the globe
  landTo: 2.4,
  reveal: 1.95, // dark backdrop fades, globe shows
  mapFires: 2.35, // maplibre's own fire points fade in
  embersOutFrom: 2.45,
  embersOutTo: 2.75,
  rotate: 2.75,
  fly: 3.5,
  end: 4.5,
}

export type Target = { x: number; y: number; color: string; size: number }

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
varying vec2 vUv;
uniform vec2 uRes;      // CSS px
uniform vec2 uCenter;   // zoom centre, CSS px, y up
uniform vec2 uBase;     // flame base, CSS px, y up
uniform float uS;       // flame height, CSS px
uniform float uZoom;
uniform float uTime;
uniform float uLife;    // 1 burning .. 0 out
uniform float uFlicker;
uniform vec3 cWhite;
uniform vec3 cPale;
uniform vec3 cOrange;
uniform vec3 cRed;
uniform vec3 cSmoke;

uint mixbits(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du;
  x ^= x >> 15u; x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}
vec3 grad(ivec3 p) {
  uint k = mixbits(uint(p.x) + mixbits(uint(p.y) + mixbits(uint(p.z))));
  vec3 g = vec3(float(k & 1023u), float((k >> 10u) & 1023u), float((k >> 20u) & 1023u)) / 511.5 - 1.0;
  return normalize(g + vec3(1e-4));
}
// gradient noise, quintic fade (C2)
float gnoise(vec3 p) {
  ivec3 i = ivec3(floor(p));
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(grad(i), f);
  float n100 = dot(grad(i + ivec3(1, 0, 0)), f - vec3(1, 0, 0));
  float n010 = dot(grad(i + ivec3(0, 1, 0)), f - vec3(0, 1, 0));
  float n110 = dot(grad(i + ivec3(1, 1, 0)), f - vec3(1, 1, 0));
  float n001 = dot(grad(i + ivec3(0, 0, 1)), f - vec3(0, 0, 1));
  float n101 = dot(grad(i + ivec3(1, 0, 1)), f - vec3(1, 0, 1));
  float n011 = dot(grad(i + ivec3(0, 1, 1)), f - vec3(0, 1, 1));
  float n111 = dot(grad(i + ivec3(1, 1, 1)), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float fbm(vec3 p, int oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    v += a * gnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.4);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 px = vUv * uRes;                                     // CSS px, y up
  vec2 P = ((px - uCenter) / uZoom + uCenter - uBase) / uS; // flame space: base y = 0, tip ~ 1
  float t = uTime;
  float y = P.y;

  // light spilled on the ground under the flame, flickering with the fire
  vec2 g = vec2(P.x / 0.7, (y + 0.02) / 0.11);
  vec3 glow = cOrange * exp(-dot(g, g)) * 0.09 * uFlicker * uLife;
  // outside the flame's box only the glow is drawn (most of the screen: no noise evaluated there)
  if (abs(P.x) > 0.85 || y < -0.28 || y > 1.3 || uLife < 0.001) {
    gl_FragColor = vec4(glow, 1.0);
    return;
  }

  // advection: the field scrolls down through the flame, so the fire rises
  vec2 a = vec2(P.x * 2.4, y * 1.7 - t * 1.35);
  vec2 w1 = vec2(fbm(vec3(a * 1.2, t * 0.30), 2), fbm(vec3(a * 1.2 + 5.2, t * 0.30), 2));
  vec2 w2 = vec2(fbm(vec3(a * 1.6 + 2.2 * w1 + 1.7, t * 0.45), 3), fbm(vec3(a * 1.6 + 2.2 * w1 + 9.2, t * 0.45), 3));
  float n = fbm(vec3(a * 2.1 + 2.6 * w2, t * 0.6), 4);

  float up = smoothstep(0.0, 1.0, y);
  float sway = (0.05 * sin(t * 1.9) + 0.03 * sin(t * 3.3 + 1.0)) * up;
  float xw = P.x - sway - 0.12 * w2.x * up;
  float halfW = mix(0.23, 0.04, smoothstep(0.0, 0.95, y));
  float core = 1.0 - smoothstep(0.0, halfW, abs(xw));
  float cool = 1.0 - smoothstep(0.1, 1.05, y);

  // noise only shapes the fire near its body: tongues split off at the top, nothing floats free
  float env = (1.0 - smoothstep(halfW * 0.9, halfW * 2.3 + 0.04, abs(xw))) * (1.0 - smoothstep(0.85, 1.2, y));
  float heat = core * (0.35 + 0.65 * cool) + n * (0.8 + 0.6 * y) * env - 0.22 * y;
  heat *= smoothstep(-0.34, 0.16, y);                       // soft falloff at the base, no edge
  heat -= max(0.0, -y) * 1.6;
  heat -= (1.0 - uLife) * 1.15;

  vec3 col = mix(cSmoke, cRed, smoothstep(0.06, 0.30, heat));
  col = mix(col, cOrange, smoothstep(0.30, 0.56, heat));
  col = mix(col, cPale, smoothstep(0.58, 0.82, heat));
  col = mix(col, cWhite, smoothstep(0.92, 1.12, heat));
  float alpha = smoothstep(0.0, 0.24, heat);
  float smoke = smoothstep(0.45, 1.05, y) * (1.0 - smoothstep(0.12, 0.34, heat));
  alpha *= 1.0 - 0.75 * smoke;                              // dark smoke fades to nothing at the top
  vec3 outc = col * alpha + glow;

  gl_FragColor = vec4(outc, 1.0);
}
`

const PVERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uPR;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  gl_PointSize = aSize * uPR * 2.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const PFRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-d * d * 5.0) * vAlpha;
  gl_FragColor = vec4(vColor * a, 1.0);
}
`

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (v: number) => {
  const x = clamp01(v)
  return x * x * (3 - 2 * x)
}

export type Stage = {
  /** draw intro time t (seconds); returns false once nothing is left to draw */
  frame: (t: number) => boolean
  /** real fire points (screen px) for the embers to land on; at most one ember per point */
  setTargets: (targets: Target[]) => void
  readonly count: number
  resize: () => void
  dispose: () => void
}

/** Throws if WebGL is unavailable. */
export function createStage(canvas: HTMLCanvasElement, count = 220): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 1)
  const pr = () => Math.min(window.devicePixelRatio || 1, 2)

  const scene = new Scene()
  const camera = new OrthographicCamera(0, 1, 0, 1, -1, 1)

  const lin = (hex: string) => new Color(hex) // sRGB hex -> linear (three colour management)
  const flameMat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uRes: { value: new Vector2(1, 1) },
      uCenter: { value: new Vector2() },
      uBase: { value: new Vector2() },
      uS: { value: 1 },
      uZoom: { value: 1 },
      uTime: { value: 0 },
      uLife: { value: 1 },
      uFlicker: { value: 1 },
      cWhite: { value: lin('#FFF6D8') },
      cPale: { value: lin('#FFE08A') },
      cOrange: { value: lin('#F28C28') },
      cRed: { value: lin('#C8371F') },
      cSmoke: { value: lin('#1c1411') },
    },
    depthTest: false,
    depthWrite: false,
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), flameMat)
  quad.frustumCulled = false
  quad.renderOrder = 0
  scene.add(quad)

  // embers
  const pos = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const alpha = new Float32Array(count)
  const color = new Float32Array(count * 3)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aSize', new BufferAttribute(size, 1))
  geo.setAttribute('aAlpha', new BufferAttribute(alpha, 1))
  geo.setAttribute('aColor', new BufferAttribute(color, 3))
  const pMat = new ShaderMaterial({
    vertexShader: PVERT,
    fragmentShader: PFRAG,
    uniforms: { uPR: { value: pr() } },
    blending: AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const points = new Points(geo, pMat)
  points.frustumCulled = false
  points.renderOrder = 1
  scene.add(points)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.4, 0.78)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  // ember state (CSS px, y down)
  const px = new Float32Array(count), py = new Float32Array(count)
  const vx = new Float32Array(count), vy = new Float32Array(count)
  const age = new Float32Array(count), life = new Float32Array(count)
  const ph = new Float32Array(count), fq = new Float32Array(count), base = new Float32Array(count)
  let W = 1, H = 1, S = 1, cx = 0, baseY = 0
  let targets: Target[] = []
  let scattered = false
  let last = 0
  const hot = [lin('#FFE08A'), lin('#F28C28'), lin('#C8371F')]
  const tcol: Color[] = []
  const c = new Color()

  const spawn = (i: number, fresh: boolean) => {
    px[i] = cx + (Math.random() - 0.5) * 0.28 * S
    py[i] = baseY - Math.random() * 0.55 * S
    vx[i] = (Math.random() - 0.5) * 0.18 * S
    vy[i] = -(0.35 + Math.random() * 0.65) * S
    life[i] = 0.8 + Math.random() * 1.1
    age[i] = fresh ? Math.random() * life[i] : 0
    ph[i] = Math.random() * 6.283
    fq[i] = 2 + Math.random() * 3
    base[i] = 1.4 + Math.random() * 2.2
  }

  const resize = () => {
    W = canvas.clientWidth || 1
    H = canvas.clientHeight || 1
    S = Math.min(W, H) * 0.56
    cx = W / 2
    baseY = H / 2 + 0.42 * S
    renderer.setPixelRatio(pr())
    renderer.setSize(W, H, false)
    composer.setPixelRatio(pr())
    composer.setSize(W, H)
    pMat.uniforms.uPR.value = pr()
    camera.left = 0
    camera.right = W
    camera.top = 0
    camera.bottom = H
    camera.updateProjectionMatrix()
    flameMat.uniforms.uRes.value.set(W, H)
    flameMat.uniforms.uCenter.value.set(W / 2, H / 2)
    flameMat.uniforms.uBase.value.set(cx, H - baseY)
    flameMat.uniforms.uS.value = S
  }
  resize()
  for (let i = 0; i < count; i++) spawn(i, true)

  const frame = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, t - last))
    last = t
    const lifeK = 1 - smooth((t - T.dieFrom) / (T.dieTo - T.dieFrom))
    const zoom = 1 - 0.28 * smooth((t - T.dieFrom) / (T.zoomTo - T.dieFrom))
    const land = smooth((t - T.landFrom) / (T.landTo - T.landFrom))
    const out = smooth((t - T.embersOutFrom) / (T.embersOutTo - T.embersOutFrom))
    const flicker = 0.8 + 0.12 * Math.sin(t * 13.1) + 0.08 * Math.sin(t * 23.7 + 1.3)

    if (t >= T.dieFrom && !scattered) {
      scattered = true
      for (let i = 0; i < count; i++) {
        // the fire goes out: embers lift and spread away from it
        vx[i] += ((px[i] - cx) / S) * 0.9 * S + (Math.random() - 0.5) * 0.35 * S
        vy[i] -= 0.25 * S
        life[i] = Math.max(life[i], age[i] + 3)
      }
    }
    for (let i = 0; i < count; i++) {
      age[i] += dt
      if (!scattered && age[i] > life[i]) spawn(i, false)
      const drag = Math.exp(-(scattered ? 1.6 : 0.4) * dt)
      vx[i] *= drag
      vy[i] *= drag
      px[i] += (vx[i] + Math.sin(age[i] * fq[i] + ph[i]) * 0.05 * S) * dt
      py[i] += vy[i] * dt
      const k = age[i] / life[i]
      // free position, seen through the pulled-back camera
      const fx = W / 2 + (px[i] - W / 2) * zoom
      const fy = H / 2 + (py[i] - H / 2) * zoom
      let a = scattered ? Math.min(1, 1.6 - 0.6 * k) : Math.min(1, age[i] / 0.15) * (1 - smooth((k - 0.6) / 0.4))
      if (k < 0.5) c.copy(hot[0]).lerp(hot[1], k / 0.5)
      else c.copy(hot[1]).lerp(hot[2], Math.min(1, (k - 0.5) / 0.5))
      let s = base[i]
      let x = fx, y = fy
      const tg = targets[i]
      if (tg && scattered) {
        x = fx + (tg.x - fx) * land
        y = fy + (tg.y - fy) * land
        s = s + (tg.size - s) * land
        c.lerp(tcol[i], land)
        a = Math.max(a, land) * (1 - out)
      } else if (scattered) {
        a *= 1 - smooth((t - T.dieFrom) / 0.6) // no real point to land on: it burns out
      }
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      size[i] = s
      alpha[i] = Math.max(0, a)
      color[i * 3] = c.r
      color[i * 3 + 1] = c.g
      color[i * 3 + 2] = c.b
    }
    for (const n of ['position', 'aSize', 'aAlpha', 'aColor']) geo.getAttribute(n).needsUpdate = true

    const u = flameMat.uniforms
    u.uTime.value = t
    u.uLife.value = lifeK
    u.uZoom.value = zoom
    u.uFlicker.value = flicker
    quad.visible = lifeK > 0.001
    bloom.strength = 0.12 + 0.3 * lifeK * flicker
    composer.render()
    return t < T.embersOutTo + 0.05
  }

  return {
    frame,
    setTargets: (tg) => {
      targets = tg.slice(0, count)
      tcol.length = 0
      targets.forEach((x) => tcol.push(lin(x.color)))
    },
    count,
    resize,
    dispose: () => {
      quad.geometry.dispose()
      flameMat.dispose()
      geo.dispose()
      pMat.dispose()
      composer.dispose()
      renderer.dispose()
    },
  }
}
