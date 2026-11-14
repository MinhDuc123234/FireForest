/** Deterministic PRNG so the demo dataset and the point clouds are identical on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Approximately normal sample (Irwin–Hall, 3 terms). */
export function gauss(rand: () => number) {
  return (rand() + rand() + rand() - 1.5) / 1.5
}
