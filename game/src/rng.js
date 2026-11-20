// Coral City Heat v2 — deterministic randomness and small math helpers.
// The whole city is seeded, so a given ?seed= always builds the same streets:
// that is what makes the screenshot poses reproducible frame after frame.
// v2.1: pick() now refuses an empty list loudly instead of returning a
// silent undefined that surfaces three modules away as a NaN position, and
// chance() gives call sites a named coin flip instead of rng() < p noise.

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

/** Pick one element of a non-empty array. */
export function pick(rng, list) {
  if (!list || list.length === 0) throw new Error('pick() called with an empty list');
  return list[Math.floor(rng() * list.length)];
}

/** True with probability p (0..1) on the given stream. */
export function chance(rng, p) {
  return rng() < p;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth 0..1 easing used by camera and water animation. */
export function smooth(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
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

/** Ground-plane distance between two {x, z} points. */
export function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
