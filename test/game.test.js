import test from 'node:test'
import assert from 'node:assert/strict'
import { TETHER_RANGE, dist, findAnchor } from '../src/physics.js'
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

test('nothing moves until the first press', () => {
  const start = createGame(1)
  const later = run(start, 120, LET_GO)
  assert.equal(later.phase, 'ready')
  assert.deepEqual(later.player, start.player)
})

test('the first press starts the run', () => {
  assert.equal(update(createGame(1), STEP, HOLD).phase, 'playing')
})

test('the opening star is always within reach of the spawn', () => {
  // If the very first press catches nothing, the player has already quit.
  for (let seed = 1; seed <= 40; seed++) {
    const state = createGame(seed)
    const opening = state.stars.find(s => s.band === 0)
    const reach = dist(
      WORLD_WIDTH / 2 + SPAWN_X_OFFSET,
      SPAWN_Y,
      opening.x,
      opening.y,
    )
    assert.ok(reach <= TETHER_RANGE, `seed ${seed}: opening star ${reach.toFixed(0)}px away`)
    assert.ok(update(state, STEP, HOLD).tether, `seed ${seed}: first press caught nothing`)
  }
})

test('the spawn is off-axis so the first orbit actually turns', () => {
  assert.notEqual(SPAWN_X_OFFSET, 0)
})

test('holding grabs the nearest star', () => {
  const state = update(createGame(1), STEP, HOLD)
  assert.ok(state.tether, 'should have tethered to the opening star')
})

test('releasing lets go and counts a fling', () => {
  let state = run(createGame(1), 10, HOLD)
  assert.ok(state.tether)
  state = update(state, STEP, LET_GO)
  assert.equal(state.tether, null)
  assert.equal(state.flings, 1)
})

test('a tethered star burns down while you hold it', () => {
  const before = update(createGame(1), STEP, HOLD)
  const after = run(before, 30, HOLD)
  assert.ok(after.tether.star.charge < before.tether.star.charge, 'charge should drain')
})

test('a star that burns out drops you mid-orbit', () => {
  const opening = update(createGame(1), STEP, HOLD).tether.star
  // Hold on well past the opening star's charge without ever letting go.
  const state = run(createGame(1), 60 * 8, HOLD)
  const spent = state.stars.find(s => s.band === opening.band)

  assert.equal(spent.charge, 0, 'the star should be used up')
  assert.ok(state.flings >= 1, 'the forced release counts as a fling')
  assert.notEqual(
    state.tether && state.tether.star.band,
    opening.band,
    'a burnt-out star cannot still be holding you',
  )
})

test('a burnt-out star can never be grabbed again', () => {
  const state = run(createGame(1), 60 * 8, HOLD)
  const dead = state.stars.filter(s => s.charge <= 0)
  assert.ok(dead.length >= 1, 'at least one star was consumed')
  for (const star of dead) {
    assert.equal(findAnchor([star], star.x, star.y), null)
  }
})

test('the camera never scrolls back down', () => {
  let state = update(createGame(3), STEP, HOLD)
  let highest = state.cameraY
  for (let i = 0; i < 600; i++) {
    state = update(state, STEP, i % 40 < 25 ? HOLD : LET_GO)
    assert.ok(state.cameraY <= highest + 1e-9, 'camera moved back down')
    highest = Math.min(highest, state.cameraY)
  }
})

test('the collapse speeds up as you climb', () => {
  assert.ok(collapseSpeed(1000) > collapseSpeed(0))
})

test('the collapse never lags far enough behind to stop mattering', () => {
  let state = update(createGame(5), STEP, HOLD)
  for (let i = 0; i < 900; i++) {
    state = update(state, STEP, i % 40 < 25 ? HOLD : LET_GO)
    if (state.phase === 'dead') break
    assert.ok(
      state.collapseY <= state.cameraY + COLLAPSE_MAX_TRAIL + 1e-6,
      'collapse fell too far behind',
    )
  }
})

test('doing nothing gets you killed by the collapse', () => {
  let state = update(createGame(1), STEP, HOLD)
  state = run(state, 60 * 40, LET_GO)
  assert.equal(state.phase, 'dead')
})

test('the player is always on screen while alive', () => {
  // A climber whose camera lags is a climber you cannot play.
  let state = update(createGame(6), STEP, HOLD)
  const pilot = makePilot()
  for (let i = 0; i < 60 * 90; i++) {
    state = update(state, STEP, pilot(state))
    if (state.phase === 'dead') break
    const onScreen = state.player.y - state.cameraY
    assert.ok(onScreen > -1, `player ${(-onScreen).toFixed(0)}px above the view`)
    assert.ok(onScreen < VIEW_HEIGHT + FALL_OUT_MARGIN + 1, 'player fell below the view')
  }
})

test('death happens in view, not somewhere off-screen', () => {
  // You have to be able to see what killed you.
  let state = update(createGame(1), STEP, HOLD)
  state = run(state, 60 * 40, LET_GO)
  assert.equal(state.phase, 'dead')
  const belowTop = state.player.y - state.cameraY
  assert.ok(
    belowTop <= VIEW_HEIGHT + FALL_OUT_MARGIN + 40,
    `died ${(belowTop - VIEW_HEIGHT).toFixed(0)}px below the bottom of the screen`,
  )
})

test('the collapse stays near the bottom edge, never far below it', () => {
  let state = update(createGame(2), STEP, HOLD)
  const pilot = makePilot()
  for (let i = 0; i < 60 * 60; i++) {
    state = update(state, STEP, pilot(state))
    if (state.phase === 'dead') break
    const belowScreen = state.collapseY - (state.cameraY + VIEW_HEIGHT)
    assert.ok(belowScreen <= VIEW_HEIGHT * 0.1 + 1e-6, 'collapse drifted out of sight')
  }
})

test('a dead run stops updating', () => {
  let state = update(createGame(1), STEP, HOLD)
  state = run(state, 60 * 40, LET_GO)
  const after = run(state, 60, HOLD)
  assert.deepEqual(after, state)
})

test('the player stays inside the walls', () => {
  let state = update(createGame(8), STEP, HOLD)
  for (let i = 0; i < 1200; i++) {
    state = update(state, STEP, i % 30 < 18 ? HOLD : LET_GO)
    assert.ok(state.player.x >= PLAYER_RADIUS - 1e-6, `escaped left: ${state.player.x}`)
    assert.ok(state.player.x <= WORLD_WIDTH - PLAYER_RADIUS + 1e-6, `escaped right: ${state.player.x}`)
    if (state.phase === 'dead') break
  }
})

test('height only ever counts upward progress', () => {
  let state = update(createGame(4), STEP, HOLD)
  let best = 0
  for (let i = 0; i < 900; i++) {
    state = update(state, STEP, i % 40 < 25 ? HOLD : LET_GO)
    assert.ok(state.height >= best, 'height went backwards')
    best = state.height
  }
})

test('the star field stays bounded on a long run', () => {
  // Stars are generated forever; without culling this is a slow memory leak.
  let state = update(createGame(10), STEP, HOLD)
  const pilot = makePilot()
  for (let i = 0; i < 60 * 120; i++) {
    state = update(state, STEP, pilot(state))
    if (state.phase === 'dead') break
  }
  assert.ok(state.stars.length < 80, `star field grew to ${state.stars.length}`)
})

/**
 * The crown jewel: the game has to be climbable by playing it as intended.
 *
 * The reference pilot only uses what a person can see — where the stars are,
 * how wound up it is, and which way it's pointing. If it can't climb, the
 * mechanic doesn't work, and no amount of art will save it.
 */
test('the intended strategy climbs, on every seed', () => {
  const heights = []
  for (let seed = 1; seed <= 12; seed++) {
    let state = createGame(seed)
    const pilot = makePilot()
    for (let i = 0; i < 60 * 120; i++) {
      state = update(state, STEP, pilot(state))
      if (state.phase === 'dead') break
    }
    heights.push(state.height)
    assert.ok(state.height > 50, `seed ${seed}: only reached ${state.height}m`)
    assert.ok(state.flings > 10, `seed ${seed}: only ${state.flings} flings`)
  }
  // A game where every run scores the same is a game with no skill in it.
  assert.ok(Math.max(...heights) > Math.min(...heights) * 2, 'runs should vary')
})

test('runs end — the collapse always wins eventually', () => {
  let state = createGame(7)
  const pilot = makePilot()
  let frames = 0
  for (; frames < 60 * 300; frames++) {
    state = update(state, STEP, pilot(state))
    if (state.phase === 'dead') break
  }
  assert.equal(state.phase, 'dead', 'a run should not be survivable forever')
})
