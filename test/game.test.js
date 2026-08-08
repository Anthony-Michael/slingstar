import test from 'node:test'
import assert from 'node:assert/strict'
import { ORBIT_RADIUS, TETHER_RANGE, dist, findAnchor } from '../src/physics.js'
import { WORLD_WIDTH } from '../src/world.js'
import {
  COLLAPSE_MAX_TRAIL,
  FALL_OUT_MARGIN,
  PLAYER_RADIUS,
  SPAWN_X_OFFSET,
  SPAWN_Y,
  VIEW_HEIGHT,
  collapseSpeed,
  createGame,
  update,
} from '../src/game.js'
import { makePilot } from './pilot.js'

const HOLD = { holding: true }
const LET_GO = { holding: false }
const STEP = 1 / 60

/** Run n frames with a fixed input. */
function run(state, frames, input) {
  for (let i = 0; i < frames; i++) state = update(state, STEP, input)
  return state
}

/** A run that has actually begun: wind up on the opening star, then release. */
function started(seed, windFrames = 40) {
  return update(run(createGame(seed), windFrames, HOLD), STEP, LET_GO)
}

/** Play with the reference pilot until death or a frame budget runs out. */
function playOut(seed, seconds = 120, onFrame) {
  let state = createGame(seed)
  const pilot = makePilot()
  for (let i = 0; i < 60 * seconds; i++) {
    state = update(state, STEP, pilot(state))
    if (onFrame) onFrame(state)
    if (state.phase === 'dead') break
  }
  return state
}

// --- The opening ----------------------------------------------------------

test('the run opens already in orbit', () => {
  const start = createGame(1)
  assert.equal(start.phase, 'ready')
  assert.ok(start.tether, 'should begin attached to the opening star')
  assert.equal(start.tether.star.band, 0)
})

test('the spawn sits exactly on the opening orbit', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const state = createGame(seed)
    const opening = state.stars.find(s => s.band === 0)
    const reach = dist(WORLD_WIDTH / 2 + SPAWN_X_OFFSET, SPAWN_Y, opening.x, opening.y)
    assert.ok(Math.abs(reach - ORBIT_RADIUS) < 1e-9, `seed ${seed}: spawned ${reach.toFixed(0)}px out`)
  }
})

test('the spawn is off-axis so the first orbit actually turns', () => {
  assert.notEqual(SPAWN_X_OFFSET, 0)
})

test('you cannot die before you let go, however long you wait', () => {
  // The opening is unloseable on purpose: a new player who does nothing, or
  // taps instead of holding, must not be killed before they understand.
  const idle = run(createGame(1), 60 * 60, LET_GO)
  assert.equal(idle.phase, 'ready')
  assert.equal(idle.tether.star.charge, idle.stars[0].maxCharge, 'star must not burn while waiting')
  assert.equal(idle.collapseY, createGame(1).collapseY, 'collapse must not rise while waiting')
})

test('waiting still turns the orbit, so the screen is never static', () => {
  const start = createGame(1)
  assert.notEqual(run(start, 30, LET_GO).tether.orbit.theta, start.tether.orbit.theta)
})

test('holding before the run winds up without burning the star', () => {
  const wound = run(createGame(1), 40, HOLD)
  assert.equal(wound.phase, 'ready')
  assert.ok(wound.armed, 'holding should arm the release')
  assert.ok(
    Math.abs(wound.tether.orbit.omega) > Math.abs(createGame(1).tether.orbit.omega),
    'should have wound up',
  )
  assert.equal(wound.tether.star.charge, wound.stars[0].maxCharge, 'still no burn')
})

test('letting go after a wind-up starts the run, carrying the launch speed', () => {
  const launched = started(1)
  assert.equal(launched.phase, 'playing')
  assert.equal(launched.tether, null)
  const speed = Math.hypot(launched.player.vx, launched.player.vy)
  assert.ok(speed > 600, `launched at only ${speed.toFixed(0)}px/s`)
})

test('a tap that never becomes a hold cannot start the run', () => {
  // Releasing without ever holding is not a launch — this is the exact case
  // that used to fling a new player at minimum spin straight to their death.
  assert.equal(run(createGame(1), 10, LET_GO).phase, 'ready')
})

// --- Tether behaviour -----------------------------------------------------

test('holding in flight grabs a star in reach', () => {
  let state = started(1)
  let grabbed = null
  for (let i = 0; i < 300 && !grabbed; i++) {
    state = update(state, STEP, HOLD)
    if (state.tether) grabbed = state.tether
    if (state.phase === 'dead') break
  }
  assert.ok(grabbed, 'should have caught a star while holding')
})

test('releasing lets go and counts a fling', () => {
  let state = run(started(1), 60, HOLD)
  assert.ok(state.tether, 'expected to be holding a star')
  const before = state.flings
  state = update(state, STEP, LET_GO)
  assert.equal(state.tether, null)
  assert.equal(state.flings, before + 1)
})

test('a tethered star burns down while you hold it', () => {
  let state = run(started(1), 30, HOLD)
  assert.ok(state.tether)
  const charge = state.tether.star.charge
  state = run(state, 20, HOLD)
  assert.ok(state.tether === null || state.tether.star.charge < charge, 'charge should drain')
})

test('a star that burns out drops you, and can never be grabbed again', () => {
  const state = run(started(1), 60 * 10, HOLD)
  const spent = state.stars.filter(s => s.charge <= 0)
  assert.ok(spent.length >= 1, 'holding forever should consume stars')
  for (const star of spent) {
    assert.equal(findAnchor([star], star.x, star.y), null)
    assert.notEqual(state.tether && state.tether.star.band, star.band)
  }
})

// --- Camera, collapse and death -------------------------------------------

test('the camera never scrolls back down', () => {
  let state = started(3)
  let highest = state.cameraY
  for (let i = 0; i < 600; i++) {
    state = update(state, STEP, i % 40 < 25 ? HOLD : LET_GO)
    assert.ok(state.cameraY <= highest + 1e-9, 'camera moved back down')
    highest = Math.min(highest, state.cameraY)
    if (state.phase === 'dead') break
  }
})

test('the collapse speeds up as you climb', () => {
  assert.ok(collapseSpeed(1000) > collapseSpeed(0))
})

test('the collapse never lags far enough behind to stop mattering', () => {
  playOut(2, 60, state => {
    if (state.phase !== 'playing') return
    assert.ok(
      state.collapseY <= state.cameraY + COLLAPSE_MAX_TRAIL + 1e-6,
      'collapse drifted out of sight',
    )
  })
})

test('the player is always on screen while alive', () => {
  playOut(6, 90, state => {
    if (state.phase !== 'playing') return
    const belowTop = state.player.y - state.cameraY
    assert.ok(belowTop > -1, `player ${(-belowTop).toFixed(0)}px above the view`)
    assert.ok(belowTop < VIEW_HEIGHT + FALL_OUT_MARGIN + 1, 'player fell below the view')
  })
})

test('doing nothing after launch gets you killed by the collapse', () => {
  assert.equal(run(started(1), 60 * 40, LET_GO).phase, 'dead')
})

test('death happens in view, not somewhere off-screen', () => {
  // You have to be able to see what killed you.
  const state = run(started(1), 60 * 40, LET_GO)
  assert.equal(state.phase, 'dead')
  const belowTop = state.player.y - state.cameraY
  assert.ok(
    belowTop <= VIEW_HEIGHT + FALL_OUT_MARGIN + 40,
    `died ${(belowTop - VIEW_HEIGHT).toFixed(0)}px below the bottom of the screen`,
  )
})

test('a dead run stops updating', () => {
  const state = run(started(1), 60 * 40, LET_GO)
  assert.deepEqual(run(state, 60, HOLD), state)
})

test('the player stays inside the walls', () => {
  let state = started(8)
  for (let i = 0; i < 1200; i++) {
    state = update(state, STEP, i % 30 < 18 ? HOLD : LET_GO)
    assert.ok(state.player.x >= PLAYER_RADIUS - 1e-6, `escaped left: ${state.player.x}`)
    assert.ok(state.player.x <= WORLD_WIDTH - PLAYER_RADIUS + 1e-6, `escaped right: ${state.player.x}`)
    if (state.phase === 'dead') break
  }
})

test('height only ever counts upward progress', () => {
  let best = 0
  playOut(4, 60, state => {
    assert.ok(state.height >= best, 'height went backwards')
    best = state.height
  })
})

test('the star field stays bounded on a long run', () => {
  // Stars are generated forever; without culling this is a slow memory leak.
  const state = playOut(10)
  assert.ok(state.stars.length < 80, `star field grew to ${state.stars.length}`)
})

// --- The mechanic itself --------------------------------------------------

/**
 * The crown jewel: the game has to be climbable by playing it as intended.
 *
 * The reference pilot only uses what a person can see — where the stars are,
 * how wound up it is, and which way it's pointing. If it can't climb, the
 * mechanic doesn't work, and no amount of art will save it.
 */
test('the intended strategy climbs, on every seed', () => {
  const heights = []
  for (let seed = 1; seed <= 16; seed++) {
    const state = playOut(seed)
    heights.push(state.height)
    // No seed may be a dead end. This caught a level generator that produced
    // zigzags wide enough to strand the pilot at the second band.
    assert.ok(state.height > 80, `seed ${seed}: only reached ${state.height}m`)
    assert.ok(state.flings > 5, `seed ${seed}: only ${state.flings} flings`)
  }
  heights.sort((a, b) => a - b)
  assert.ok(heights[8] > 150, `median run only reached ${heights[8]}m`)
  // A game where every run scores the same is a game with no skill in it.
  assert.ok(heights[15] > heights[0] * 2, 'runs should vary')
})

test('runs last long enough to be worth playing', () => {
  // A two-second run reads as broken, however fair it is.
  const times = []
  for (let seed = 1; seed <= 16; seed++) times.push(playOut(seed).time)
  times.sort((a, b) => a - b)
  assert.ok(times[8] > 6, `median run only lasted ${times[8].toFixed(1)}s`)
})

test('runs end — the collapse always wins eventually', () => {
  assert.equal(playOut(7, 300).phase, 'dead', 'a run should not be survivable forever')
})

test('every star is reachable from the one below it', () => {
  // Guards the level generator against producing an impossible gap.
  const state = playOut(3)
  const byBand = [...state.stars].sort((a, b) => a.band - b.band)
  for (let i = 1; i < byBand.length; i++) {
    const gap = dist(byBand[i].x, byBand[i].y, byBand[i - 1].x, byBand[i - 1].y)
    assert.ok(gap < TETHER_RANGE * 3, `band ${byBand[i].band} is ${gap.toFixed(0)}px from the last`)
  }
})
