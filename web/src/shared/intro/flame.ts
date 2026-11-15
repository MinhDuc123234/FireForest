import { Camera, Mesh, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderer } from 'three'

/*
 * One flame, drawn by a fragment shader written for this site: two layers of value-noise fBm scroll
 * upward through a teardrop mask; the heat value maps to the site's fire ramp
 * #FFE08A -> #F28C28 -> #C8371F -> transparent. `shrink` (0..1) collapses the flame into one bright point.
 */
const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uShrink;
uniform vec2 uRes;

float hash(vec2 p) {
  p = fract(p * vec2(127.13, 311.71));
  p += dot(p, p + 34.17);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  // centred, aspect-correct coordinates; 1 unit = the shorter side
  vec2 p = (vUv - 0.5) * uRes / min(uRes.x, uRes.y);
  float s = mix(1.0, 0.035, uShrink);
  vec2 q = p / s;

  float y = q.y + 0.24;                                  // 0 at the base of the flame
  float h = clamp(y / 0.62, 0.0, 1.0);                   // 0 base .. 1 tip
  float n1 = fbm(vec2(q.x * 3.0, y * 2.2 - uTime * 1.5));
  float n2 = fbm(vec2(q.x * 7.0 + 4.0, y * 5.5 - uTime * 2.6));

  // sway grows with height; the body narrows towards a flickering tip
  float dx = q.x + (n1 - 0.5) * 0.30 * h;
  float halfW = mix(0.17, 0.015, pow(h, 0.75));
  float body = 1.0 - smoothstep(halfW * 0.45, halfW, abs(dx));
  float tip = 1.0 - smoothstep(0.42, 0.62 + (n2 - 0.5) * 0.28, y);
  float base = 1.0 - smoothstep(0.75, 1.0, length(vec2(q.x / 0.17, min(y, 0.0) / 0.075))); // rounded bottom

  float heat = body * tip * base;
  heat *= 0.45 + 0.7 * n2;
  heat *= (1.15 - 0.6 * h) * (1.0 - 0.55 * smoothstep(0.0, 1.0, abs(dx) / halfW)); // hot core, cooler edges and tip
  heat = clamp(heat, 0.0, 1.2);

  vec3 red = vec3(0.784, 0.216, 0.122);                  // #C8371F
  vec3 orange = vec3(0.949, 0.549, 0.157);               // #F28C28
  vec3 pale = vec3(1.0, 0.878, 0.541);                   // #FFE08A
  vec3 c = mix(red, orange, smoothstep(0.28, 0.58, heat));
  c = mix(c, pale, smoothstep(0.55, 0.85, heat));
  float a = smoothstep(0.06, 0.26, heat);

  // as it shrinks, the flame becomes a point of light
  float d = length(p);
  float glow = exp(-d * mix(60.0, 140.0, uShrink)) * uShrink;
  c = mix(c, pale, uShrink * 0.6);
  a = clamp(a * (1.0 - 0.6 * uShrink) + glow * 1.4, 0.0, 1.0);
  c = a > 0.0 ? mix(c, pale, clamp(glow, 0.0, 1.0)) : c;

  gl_FragColor = vec4(c * a, a);
}
`

export type Flame = {
  /** draw one frame: t in seconds, shrink 0..1 */
  draw: (t: number, shrink: number) => void
  resize: () => void
  dispose: () => void
}

/** Throws if WebGL is unavailable. */
export function createFlame(canvas: HTMLCanvasElement): Flame {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' })
  renderer.setClearColor(0x000000, 0)
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uTime: { value: 0 }, uShrink: { value: 0 }, uRes: { value: [1, 1] } },
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  })
  const geometry = new PlaneGeometry(2, 2)
  const scene = new Scene()
  scene.add(new Mesh(geometry, material))
  const camera = new Camera()

  const resize = () => {
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h, false)
    material.uniforms.uRes.value = [w, h]
  }
  resize()
  return {
    draw: (t, shrink) => {
      material.uniforms.uTime.value = t
      material.uniforms.uShrink.value = shrink
      renderer.render(scene, camera)
    },
    resize,
    dispose: () => {
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    },
  }
}
