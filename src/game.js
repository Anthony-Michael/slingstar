// Game rules and state. Pure: `update` takes state + dt + input and returns the
// next state, so entire runs can be simulated headlessly in tests.

import {
  MIN_SPIN,
  ORBIT_RADIUS,
  TETHER_RANGE,
  attach,
  clampSpeed,
  dist,
  findAnchor,
  orbitToBody,
  stepFree,
  stepOrbit,
} from './physics.js'
import {
  BAND_HEIGHT,
  WORLD_WIDTH,
  cullBelow,
  ensureBands,
  heightFrom,
  makeRng,
} from './world.js'

export const VIEW_HEIGHT = 960 // design-space viewport; the canvas scales to fit
export const PLAYER_RADIUS = 13

// cameraY is the world Y at the TOP of the viewport; the player sits this far
// down it. Balances two competing needs: enough view above to see the stars
// you're aiming for, and enough below to fall and still recover.
export const CAMERA_LOOKAHEAD = 0.4
export const WALL_BOUNCE = 0.72 // walls give back most of your speed, but not all

// The run opens already in orbit around the first star, below and to the left
// of it. Starting attached is what makes the opening unloseable: a new player
// who taps instead of holding used to fling themselves at minimum spin and die
// before understanding anything. Now you cannot fall until you choose to.
export const SPAWN_ANGLE = -0.62 // radians from straight down
export const SPAWN_X_OFFSET = ORBIT_RADIUS * Math.sin(SPAWN_ANGLE)
export const SPAWN_Y = ORBIT_RADIUS * Math.cos(SPAWN_ANGLE)

// The collapse: a rising floor that turns a climber into a game.
export const COLLAPSE_START = SPAWN_Y + 620 // far enough below that nobody dies in the first second
export const COLLAPSE_BASE_SPEED = 55 // px/s at ground level
export const COLLAPSE_RAMP = 0.30 // extra px/s for every 100m climbed
// The collapse is the visible floor of the world: always kept just inside the
// bottom edge, so the thing that kills you is on screen the whole time and
// falling out of view and falling into it are the same event.
export const COLLAPSE_MAX_TRAIL = VIEW_HEIGHT * 0.96

// Backstop only — the clamp above keeps the collapse higher than this in
// practice, but nothing should ever survive below the bottom of the screen.
export const FALL_OUT_MARGIN = 40

export const STAR_DRAIN = 1 // charge burned per second of holding on

// How long a just-released star stays un-grabbable. Long enough to fly out of
// its orbit, short enough that a bad launch can still be recovered.
export const RELEASE_COOLDOWN = 0.45

/** A fresh run. Seed is explicit so tests and "retry same field" are possible. */
export function createGame(seed = (Math.random() * 1e9) | 0) {
  const rng = makeRng(seed)
  const stars = ensureBands([], 12, rng)
  const opening = stars[0]
  const player = { x: WORLD_WIDTH / 2 + SPAWN_X_OFFSET, y: SPAWN_Y, vx: 0, vy: 0 }
  return {
    seed,
    rng,
    phase: 'ready',
    player,
    stars,
    // Already attached, coasting. The player's first act is letting go.
    tether: { star: opening, orbit: { r: ORBIT_RADIUS, theta: SPAWN_ANGLE, omega: MIN_SPIN } },
    armed: false, // set once they've held; releasing then starts the run
    justLeft: null, // band of the star just released, ignored until flown clear
    cameraY: player.y - VIEW_HEIGHT * CAMERA_LOOKAHEAD,
    // Start already inside the visible-floor clamp, so the collapse never jumps
    // upward on the first frame of play.
    collapseY: Math.min(
      COLLAPSE_START,
      player.y - VIEW_HEIGHT * CAMERA_LOOKAHEAD + COLLAPSE_MAX_TRAIL,
    ),
    height: 0,
    flings: 0,
    time: 0,
  }
}

/** How fast the collapse climbs at a given height — pressure grows with altitude. */
export function collapseSpeed(height) {
  return COLLAPSE_BASE_SPEED + (height / 100) * COLLAPSE_RAMP * 100
}

/** Keep the player inside the walls, bouncing rather than sticking. */
function bounceOffWalls(body) {
  const left = PLAYER_RADIUS
  const right = WORLD_WIDTH - PLAYER_RADIUS
  if (body.x < left) return { ...body, x: left, vx: Math.abs(body.vx) * WALL_BOUNCE }
  if (body.x > right) return { ...body, x: right, vx: -Math.abs(body.vx) * WALL_BOUNCE }
  return body
}

/**
 * Advance one frame.
 *
 * `input.holding` is the entire control scheme: hold to grab the nearest star,
 * release to fly off along the tangent.
 */
export function update(state, dt, input) {
  if (state.phase === 'dead') return state

  // Before the run starts you are safely in orbit: the star doesn't burn, the
  // collapse doesn't rise, and nothing can kill you. Holding winds you up;
  // letting go is what commits you. You cannot lose before you understand.
  if (state.phase === 'ready') {
    const orbit = stepOrbit(state.tether.orbit, dt, input.holding)
    const armed = state.armed || input.holding

    if (armed && !input.holding) {
      // Released after a wind-up — the run begins, carrying that launch speed.
      return {
        ...state,
        phase: 'playing',
        player: orbitToBody(orbit, state.tether.star),
        tether: null,
        justLeft: { band: state.tether.star.band, cooldown: RELEASE_COOLDOWN },
        flings: 1,
      }
    }

    return {
      ...state,
      armed,
      tether: { ...state.tether, orbit },
      player: orbitToBody(orbit, state.tether.star),
    }
  }

  let { player, tether, stars, collapseY, flings, justLeft } = state

  // You launch from inside a star's own reach, so without this you'd be yanked
  // straight back onto the star you just left — holding through a flight would
  // cancel the climb instead of chaining to the next star. The block lifts as
  // soon as you've flown clear, and expires on its own regardless: an arc that
  // curves back without ever getting clear must not strand you next to a
  // perfectly good star with no way to grab it.
  if (justLeft) {
    const star = stars.find(s => s.band === justLeft.band)
    const flownClear = !star || dist(player.x, player.y, star.x, star.y) > TETHER_RANGE
    const cooldown = justLeft.cooldown - dt
    justLeft = flownClear || cooldown <= 0 ? null : { ...justLeft, cooldown }
  }

  // --- Tether: grab on press, let go on release ---
  if (input.holding && !tether) {
    const candidates = justLeft ? stars.filter(s => s.band !== justLeft.band) : stars
    const star = findAnchor(candidates, player.x, player.y)
    if (star) tether = { star, orbit: attach(player, star) }
  } else if (!input.holding && tether) {
    justLeft = { band: tether.star.band, cooldown: RELEASE_COOLDOWN }
    tether = null
    flings++
  }

  // --- Motion ---
  if (tether) {
    // Holding winds the orbit up; the longer you hold, the harder the launch.
    const orbit = stepOrbit(tether.orbit, dt)
    player = orbitToBody(orbit, tether.star)

    // Holding on burns the star. Stars are consumed by being useful, which is
    // what stops anyone parking in a safe orbit forever.
    const drained = Math.max(0, tether.star.charge - STAR_DRAIN * dt)
    stars = stars.map(s => (s === tether.star ? { ...s, charge: drained } : s))
    if (drained <= 0) {
      tether = null // burnt out mid-swing: you keep the speed you'd earned
      flings++
    } else {
      // Keep the tether pointing at the updated star object.
      tether = { star: stars.find(s => s.band === tether.star.band), orbit }
    }
  } else {
    player = stepFree(player, dt)
  }

  player = bounceOffWalls(clampSpeed(player))

  // --- Camera follows upward only; a climber never scrolls back down ---
  const cameraY = Math.min(state.cameraY, player.y - VIEW_HEIGHT * CAMERA_LOOKAHEAD)

  // --- The collapse rises, and never lags so far back that it stops mattering ---
  const height = Math.max(state.height, heightFrom(player.y, SPAWN_Y))
  collapseY -= collapseSpeed(height) * dt
  collapseY = Math.min(collapseY, cameraY + COLLAPSE_MAX_TRAIL)

  // --- Keep the field stocked above, and trimmed below ---
  const topBand = Math.ceil((-(cameraY - VIEW_HEIGHT)) / BAND_HEIGHT) + 4
  stars = ensureBands(stars, Math.max(12, topBand), state.rng)
  stars = cullBelow(stars, collapseY + VIEW_HEIGHT)

  const dead =
    player.y > collapseY || player.y > cameraY + VIEW_HEIGHT + FALL_OUT_MARGIN

  return {
    ...state,
    player,
    tether: dead ? null : tether,
    stars,
    cameraY,
    collapseY,
    height,
    flings,
    justLeft,
    time: state.time + dt,
    phase: dead ? 'dead' : 'playing',
  }
}
