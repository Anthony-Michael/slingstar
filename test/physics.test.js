import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GRAVITY,
  MAX_SPEED,
  MAX_SPIN,
  MIN_SPIN,
  MIN_TETHER_RADIUS,
  ORBIT_RADIUS,
  TETHER_RANGE,
  attach,
  clampSpeed,
  findAnchor,
  orbitSpeed,
  orbitToBody,
  stepFree,
  stepOrbit,
} from '../src/physics.js'

const body = (x, y, vx = 0, vy = 0) => ({ x, y, vx, vy })
const STAR = { x: 0, y: 0, charge: 1 }

test('free fall accelerates downward and moves', () => {
  const after = stepFree(body(0, 0), 0.1)
  assert.equal(after.vy, GRAVITY * 0.1)
  assert.equal(after.vx, 0)
  assert.ok(after.y > 0, 'should have fallen')
})

test('horizontal velocity is unchanged by gravity', () => {
  const after = stepFree(body(0, 0, 200, 0), 0.5)
  assert.equal(after.vx, 200)
  assert.equal(after.x, 100)
})

test('speed is clamped but direction preserved', () => {
  const fast = clampSpeed(body(0, 0, 9000, 0))
  assert.equal(Math.round(Math.hypot(fast.vx, fast.vy)), MAX_SPEED)
  assert.ok(fast.vx > 0, 'still travelling the same way')
})

test('clampSpeed leaves slow bodies untouched', () => {
  const slow = body(0, 0, 10, 10)
  assert.equal(clampSpeed(slow), slow)
})

test('attaching keeps you at arm’s length from the star', () => {
  assert.equal(attach(body(2, 0), STAR).r, MIN_TETHER_RADIUS)
})

test('attaching never starts an orbit wider than the reach', () => {
  assert.equal(attach(body(TETHER_RANGE * 3, 0), STAR).r, TETHER_RANGE)
})

test('a dead-stop grab still spins, so the game never stalls', () => {
  assert.equal(Math.abs(attach(body(0, 150), STAR).omega), MIN_SPIN)
})

test('you keep orbiting the way you were already travelling', () => {
  // Below the star moving right should orbit one way; moving left, the other.
  const right = attach(body(0, 150, 400, 0), STAR)
  const left = attach(body(0, 150, -400, 0), STAR)
  assert.ok(Math.sign(right.omega) !== Math.sign(left.omega), 'direction should follow approach')
})

test('a grab never exceeds the spin ceiling', () => {
  assert.ok(Math.abs(attach(body(0, 100, 99999, 0), STAR).omega) <= MAX_SPIN)
})

test('holding on winds the orbit up to the ceiling and stops there', () => {
  let orbit = attach(body(0, 150), STAR)
  const initial = Math.abs(orbit.omega)
  for (let i = 0; i < 10; i++) orbit = stepOrbit(orbit, 1 / 60)
  assert.ok(Math.abs(orbit.omega) > initial, 'should be speeding up')
  for (let i = 0; i < 600; i++) orbit = stepOrbit(orbit, 1 / 60)
  assert.ok(Math.abs(orbit.omega) <= MAX_SPIN + 1e-9, 'never past the ceiling')
})

test('spin-up preserves direction', () => {
  let orbit = attach(body(0, 150, -400, 0), STAR)
  const sign = Math.sign(orbit.omega)
  for (let i = 0; i < 120; i++) orbit = stepOrbit(orbit, 1 / 60)
  assert.equal(Math.sign(orbit.omega), sign, 'winding up must not reverse you')
})

test('however you grab a star, the orbit settles to the same circle', () => {
  for (const start of [body(220, 0), body(5, 5), body(0, 150, 900, 0)]) {
    let orbit = attach(start, STAR)
    for (let i = 0; i < 120; i++) orbit = stepOrbit(orbit, 1 / 60)
    assert.ok(Math.abs(orbit.r - ORBIT_RADIUS) < 1e-6, `settled at ${orbit.r}`)
  }
})

test('the orbit stays on its circle as it turns', () => {
  let orbit = attach(body(0, ORBIT_RADIUS), STAR)
  for (let i = 0; i < 300; i++) {
    orbit = stepOrbit(orbit, 1 / 60)
    const p = orbitToBody(orbit, STAR)
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - orbit.r) < 1e-6, 'drifted off the circle')
  }
})

test('release velocity is tangential — square to the tether', () => {
  let orbit = attach(body(0, 150, 300, 0), STAR)
  for (let i = 0; i < 40; i++) orbit = stepOrbit(orbit, 1 / 60)
  const p = orbitToBody(orbit, STAR)
  const along = (p.x / orbit.r) * p.vx + (p.y / orbit.r) * p.vy
  assert.ok(Math.abs(along) < 1e-6, 'velocity should have no outward component')
})

test('a fully wound orbit can clear a band gap', () => {
  // The whole climb depends on this: a full wind-up has to out-run gravity
  // across the vertical spacing between stars, with margin to spare.
  let orbit = attach(body(0, 150), STAR)
  for (let i = 0; i < 300; i++) orbit = stepOrbit(orbit, 1 / 60)
  const apex = orbitSpeed(orbit) ** 2 / (2 * GRAVITY)
  assert.ok(apex > 180 * 1.8, `a full wind-up only reaches ${apex.toFixed(0)}px`)
})

test('findAnchor picks the nearest live star in range', () => {
  const stars = [
    { x: 0, y: 0, charge: 1 },
    { x: 60, y: 0, charge: 1 },
  ]
  assert.equal(findAnchor(stars, 70, 0), stars[1])
})

test('findAnchor ignores burnt-out stars', () => {
  const stars = [
    { x: 60, y: 0, charge: 0 },
    { x: 200, y: 0, charge: 1 },
  ]
  assert.equal(findAnchor(stars, 70, 0), stars[1])
})

test('findAnchor returns null when nothing is close enough', () => {
  assert.equal(findAnchor([{ x: 9999, y: 0, charge: 1 }], 0, 0), null)
})
