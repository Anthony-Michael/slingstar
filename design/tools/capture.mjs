// Plays a real run headlessly with the reference pilot and dumps the exact
// game states the mockups will draw. Nothing here is invented — every star
// position, tether angle and collapse height comes from the shipped sim.

import { createGame, update, VIEW_HEIGHT } from '../../src/game.js'
import { windFraction } from '../../src/render.js'
import { makePilot } from '../../test/pilot.js'
import { writeFileSync } from 'node:fs'

const STEP = 1 / 60
const TRAIL_LENGTH = 14
const SEED = Number(process.argv[2] ?? 20250826)

function snap(state, trail, label) {
  return {
    label,
    phase: state.phase,
    armed: state.armed,
    height: state.height,
    flings: state.flings,
    time: state.time,
    cameraY: state.cameraY,
    collapseY: state.collapseY,
    wind: windFraction(state),
    player: { ...state.player },
    trail: trail.map(p => ({ ...p })),
    tetherBand: state.tether ? state.tether.star.band : null,
    orbit: state.tether ? { ...state.tether.orbit } : null,
    stars: state.stars
      .filter(s => s.y > state.cameraY - 160 && s.y < state.cameraY + VIEW_HEIGHT + 160)
      .map(s => ({ band: s.band, x: s.x, y: s.y, charge: s.charge, maxCharge: s.maxCharge, twinkle: s.twinkle })),
  }
}

const scenes = {}

// --- Scene 1 + 2: the opening, which is phase 'ready' -----------------------
let s = createGame(SEED)
let trail = []
scenes.ready = snap(s, trail, 'ready')

// Hold for 0.75s: armed, winding up, the "LET GO" half of the prompt.
for (let i = 0; i < Math.round(0.75 * 60); i++) s = update(s, STEP, { holding: true })
scenes.letgo = snap(s, trail, 'letgo')

// --- Play the run out with the reference pilot ------------------------------
s = createGame(SEED)
const pilot = makePilot()
trail = []
let best = null
let deathPrev = null

for (let i = 0; i < 60 * 40 && s.phase !== 'dead'; i++) {
  const prev = s
  s = update(s, STEP, pilot(s))
  if (s.phase === 'playing') {
    trail.push({ x: s.player.x, y: s.player.y })
    if (trail.length > TRAIL_LENGTH) trail.shift()
  }
  if (s.phase === 'dead') { deathPrev = prev; break }

  // The hero frame: tethered, well wound up, high enough that the sky has
  // shifted and the collapse is a visible presence.
  const w = windFraction(s)
  if (s.tether && w > 0.55 && s.height > 120) {
    const score = w + s.height / 1000
    if (!best || score > best.score) best = { score, snap: snap(s, trail, 'playing') }
  }
}

scenes.playing = best ? best.snap : null
scenes.death = snap(s, trail, 'death')
scenes.deathPrev = deathPrev ? snap(deathPrev, trail, 'deathPrev') : null

for (const [k, v] of Object.entries(scenes)) {
  if (!v) { console.log(k, 'MISSING'); continue }
  console.log(
    k.padEnd(10),
    'phase=' + v.phase,
    'h=' + v.height + 'm',
    'wind=' + v.wind.toFixed(2),
    'stars=' + v.stars.length,
    'tether=' + v.tetherBand,
    'camY=' + Math.round(v.cameraY),
    'collapseY=' + Math.round(v.collapseY),
    'collapse-on-screen-at=' + Math.round(v.collapseY - v.cameraY),
  )
}

writeFileSync(
  new URL('./scenes.json', import.meta.url),
  JSON.stringify(scenes, null, 1),
)
