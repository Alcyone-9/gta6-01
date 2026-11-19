// Coral City Heat — deterministic randomness and small math helpers.
// The whole city is seeded, so a given ?seed= always builds the same streets:
// that is what makes the screenshot poses reproducible.

/** mulberry32: a tiny, fast, seedable PRNG. Returns a function giving [0, 1). */
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** Random integer in [min, max] inclusive. */
export function intRange(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

/** Pick one element of an array. */
export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed angular difference from `from` to `to`, in radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current, target, maxStep) {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

/** Squared distance between two {x, z} points on the ground plane. */
export function distSq2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
