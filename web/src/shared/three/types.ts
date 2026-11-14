import type * as THREE from 'three'

export type SceneContext = { scene: THREE.Scene; pixelRatio: number }
export type BuiltScene = { update: (t: number) => void }
export type SceneBuilder = (ctx: SceneContext) => BuiltScene
