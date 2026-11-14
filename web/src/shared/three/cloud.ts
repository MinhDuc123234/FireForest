import * as THREE from 'three'

export type RGB = [number, number, number]

export const BONE: RGB = [0.93, 0.92, 0.88]
export const BONE_DIM: RGB = [0.55, 0.55, 0.52]
export const EMBER: RGB = [1.0, 0.42, 0.12]
export const HOT: RGB = [1.0, 0.78, 0.48]

/** Uniforms shared by every material in one scene, so one write per frame updates all of them. */
export type SharedUniforms = {
  uTime: { value: number }
  uPixelRatio: { value: number }
  uScanY: { value: number }
  uScan: { value: number }
}

export function createUniforms(pixelRatio: number): SharedUniforms {
  return {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uScanY: { value: -999 },
    uScan: { value: 0 },
  }
}

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aPulse;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uScanY;
  uniform float uScan;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    float pulse = aPulse > 0.0 ? 0.7 + 0.3 * sin(uTime * 2.2 + aPulse * 6.2831) : 1.0;
    float band = uScan * (1.0 - smoothstep(0.0, 0.22, abs(world.y - uScanY)));
    vColor = mix(aColor, vec3(1.0, 0.5, 0.18), band);
    vAlpha = aAlpha * (1.0 + band * 0.6);
    float size = aSize * pulse * (1.0 + band * 0.7) * uPixelRatio * (12.0 / -mv.z);
    gl_PointSize = max(size, 1.4 * uPixelRatio);
  }
`

const discFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = 1.0 - smoothstep(0.36, 0.5, d);
    gl_FragColor = vec4(vColor, a * min(vAlpha, 1.0));
  }
`

const glowFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = 1.0 - smoothstep(0.0, 0.18, d);
    float halo = pow(1.0 - d, 2.2);
    vec3 col = mix(vColor, vec3(1.0, 0.92, 0.8), core);
    gl_FragColor = vec4(col, (halo * 0.85 + core) * vAlpha);
  }
`

export function pointsMaterial(uniforms: SharedUniforms, glow = false) {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader,
    fragmentShader: glow ? glowFragment : discFragment,
    transparent: true,
    depthWrite: !glow,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
}

/** Accumulates particles, then turns them into one THREE.Points over a BufferGeometry. */
export class Cloud {
  private pos: number[] = []
  private col: number[] = []
  private size: number[] = []
  private alpha: number[] = []
  private pulse: number[] = []

  add(x: number, y: number, z: number, color: RGB, size = 2, alpha = 1, pulse = 0) {
    this.pos.push(x, y, z)
    this.col.push(color[0], color[1], color[2])
    this.size.push(size)
    this.alpha.push(alpha)
    this.pulse.push(pulse)
  }

  get count() {
    return this.size.length
  }

  build(material: THREE.Material) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 1))
    g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(this.alpha, 1))
    g.setAttribute('aPulse', new THREE.Float32BufferAttribute(this.pulse, 1))
    g.computeBoundingSphere()
    const points = new THREE.Points(g, material)
    points.frustumCulled = false
    return points
  }
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
