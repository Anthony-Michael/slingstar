import test from 'node:test'
import assert from 'node:assert/strict'
import { TETHER_RANGE, dist } from '../src/physics.js'
import {
  BAND_HEIGHT,
  EDGE_MARGIN,
  MAX_HORIZONTAL_STEP,
  WORLD_WIDTH,
  chargeForBand,
  cullBelow,
  ensureBands,
  heightFrom,
  makeRng,
} from '../src/world.js'

test('the same seed always builds the same field', () => {
  const a = ensureBands([], 20, makeRng(7))
  const b = ensureBands([], 20, makeRng(7))
  assert.deepEqual(a, b)
})

test('different seeds build different fields', () => {
  const a = ensureBands([], 20, makeRng(1))
  const b = ensureBands([], 20, makeRng(2))
  assert.notDeepEqual(a, b)
})

test('stars stay inside the play area', () => {
  for (const star of ensureBands([], 200, makeRng(99))) {
    assert.ok(star.x >= EDGE_MARGIN, `x=${star.x} past left edge`)
    assert.ok(star.x <= WORLD_WIDTH - EDGE_MARGIN, `x=${star.x} past right edge`)
  }
})

test('bands climb upward one BAND_HEIGHT at a time', () => {
  const stars = ensureBands([], 5, makeRng(3))
  for (let i = 1; i < stars.length; i++) {
    assert.equal(stars[i].y, stars[i - 1].y - BAND_HEIGHT)
  }
})

test('every consecutive pair of stars is physically reachable', () => {
  // The whole climb is impossible if any gap exceeds what a fling can cross.
  // Worst case is a full horizontal step plus one band of height.
  const worstCase = Math.hypot(MAX_HORIZONTAL_STEP, BAND_HEIGHT)
  const stars = ensureBands([], 400, makeRng(2026))
  for (let i = 1; i < stars.length; i++) {
    const gap = dist(stars[i].x, stars[i].y, stars[i - 1].x, stars[i - 1].y)
    assert.ok(gap <= worstCase + 1e-6, `band ${i} gap of ${gap.toFixed(0)} too wide`)
  }
})

test('the worst-case gap is within a fling of tether range', () => {
  // A sanity bound on the tuning itself: you should never need to cross more
  // than roughly three tether-ranges of empty space.
  const worstCase = Math.hypot(MAX_HORIZONTAL_STEP, BAND_HEIGHT)
  assert.ok(worstCase < TETHER_RANGE * 3, `worst gap ${worstCase.toFixed(0)} is too punishing`)
})

test('ensureBands extends without disturbing existing stars', () => {
  const rng = makeRng(11)
  const first = ensureBands([], 5, rng)
  first[2].charge = 0.25 // pretend the player burned this one
  const extended = ensureBands(first, 12, rng)
  assert.equal(extended[2].charge, 0.25, 'spent charge survives extension')
  assert.ok(extended.length > first.length)
  assert.equal(extended[extended.length - 1].band, 12)
})

test('ensureBands is a no-op when the field already reaches high enough', () => {
  const stars = ensureBands([], 10, makeRng(4))
  assert.equal(ensureBands(stars, 10, makeRng(4)), stars)
})

test('stars burn out faster higher up, but never to nothing', () => {
  assert.ok(chargeForBand(0) > chargeForBand(50), 'later stars are stingier')
  assert.ok(chargeForBand(100000) >= 1.1, 'never becomes unplayable')
})

test('culling drops only what is below the cutoff', () => {
  const stars = ensureBands([], 10, makeRng(5))
  const kept = cullBelow(stars, -500)
  assert.ok(kept.length > 0 && kept.length < stars.length)
  assert.ok(kept.every(s => s.y < -500))
})

test('height is measured upward from the start and never negative', () => {
  assert.equal(heightFrom(0), 0)
  assert.equal(heightFrom(500), 0, 'falling below the start is still zero')
  assert.equal(heightFrom(-1000), 100)
})
