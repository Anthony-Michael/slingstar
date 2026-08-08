// Procedural star field. Pure and seeded, so a given seed always produces the
// same climb — which makes it testable and makes "same seed" runs comparable.

export const WORLD_WIDTH = 540 // portrait play area; the camera scales to fit
export const BAND_HEIGHT = 180 // vertical spacing between star bands
// Keep stars far enough in that a full orbit around one still fits on screen.
export const EDGE_MARGIN = 130
export const MAX_HORIZONTAL_STEP = 140 // guarantees the next star stays reachable
export const START_Y = 0

/** Deterministic PRNG (mulberry32) — small, fast, good enough for level layout. */
export function makeRng(seed) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * How much charge a star holds, by band. Early stars are generous so the first
 * ten seconds always feel good; later ones burn out fast enough to keep you
 * moving. Floors out so the climb stays possible rather than becoming a wall.
 */
export function chargeForBand(band) {
  return Math.max(1.1, 3.2 - band * 0.045)
}

/**
 * Build one star for a band. `prevX` keeps the horizontal step within reach of
 * the previous star, so the climb is always physically completable.
 */
export function makeStar(band, rng, prevX) {
  const minX = Math.max(EDGE_MARGIN, prevX - MAX_HORIZONTAL_STEP)
  const maxX = Math.min(WORLD_WIDTH - EDGE_MARGIN, prevX + MAX_HORIZONTAL_STEP)
  // The opening star always sits dead centre, directly above the spawn. The
  // first grab has to be guaranteed — a player who can't reach anything on
  // their first press has already quit.
  const x = band === 0 ? WORLD_WIDTH / 2 : minX + rng() * (maxX - minX)
  const charge = chargeForBand(band)
  return {
    band,
    x,
    y: START_Y - band * BAND_HEIGHT,
    charge,
    maxCharge: charge,
    // Cosmetic only — gives the field some visual rhythm.
    twinkle: rng() * Math.PI * 2,
  }
}

/**
 * Extend the field upward until it covers `throughBand`. Returns a new array;
 * existing stars keep their identity (and their spent charge).
 */
export function ensureBands(stars, throughBand, rng) {
  if (stars.length > 0 && stars[stars.length - 1].band >= throughBand) return stars
  const next = stars.slice()
  let prevX = next.length > 0 ? next[next.length - 1].x : WORLD_WIDTH / 2
  const from = next.length > 0 ? next[next.length - 1].band + 1 : 0
  for (let band = from; band <= throughBand; band++) {
    const star = makeStar(band, rng, prevX)
    next.push(star)
    prevX = star.x
  }
  return next
}

/**
 * Drop stars that have fallen far below the view. They can never matter again,
 * and an unbounded array is a slow memory leak on a long run.
 */
export function cullBelow(stars, cutoffY) {
  return stars.filter(star => star.y < cutoffY)
}

/**
 * Height climbed in metres, measured up from wherever the run began. Up is
 * negative y, and falling below the start never scores as negative progress.
 */
export function heightFrom(y, datum = START_Y) {
  return Math.max(0, Math.floor((datum - y) / 10))
}
