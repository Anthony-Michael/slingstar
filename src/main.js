// Bootstrap and the frame loop — the only genuinely impure module.

import { createGame, update, VIEW_HEIGHT } from './game.js'
import { WORLD_WIDTH } from './world.js'
import { draw, windFraction } from './render.js'
import { createInput } from './input.js'
import { sfx, toggleMute, isMuted } from './audio.js'
import { loadBest, saveBest } from './storage.js'
import { initPortal, gameplayStart, gameplayStop, commercialBreak } from './portal.js'

const STEP = 1 / 60 // fixed simulation step, independent of display refresh rate
const MAX_FRAME = 0.1 // never simulate more than this per frame, or a stall spirals
const TRAIL_LENGTH = 14

const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d', { alpha: false })
const ui = {
  height: document.getElementById('height'),
  best: document.getElementById('best'),
  meter: document.getElementById('meter-fill'),
  overlay: document.getElementById('overlay'),
  title: document.getElementById('overlay-title'),
  detail: document.getElementById('overlay-detail'),
  mute: document.getElementById('mute'),
}

const input = createInput(canvas)
let view = { width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0 }
let state = createGame()
let best = loadBest()
let trail = []
let accumulator = 0
let lastTime = performance.now()
let clock = 0
let wasTethered = false
let lastMilestone = 0
let deadAt = 0
// Module-local, deliberately NOT read off the debug hook: the page shares its
// global namespace with whatever a portal injects, and a loop that dereferences
// a global every frame dies permanently the moment something clobbers it.
let paused = false

/** Fit the 540×960 design space into whatever window we were given. */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) // cap DPR; phones lie and it costs fill rate
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`

  const scale = Math.min(w / WORLD_WIDTH, h / VIEW_HEIGHT) * dpr
  view = {
    width: canvas.width,
    height: canvas.height,
    scale,
    offsetX: (canvas.width - WORLD_WIDTH * scale) / 2,
    offsetY: (canvas.height - VIEW_HEIGHT * scale) / 2,
  }
}

function restart() {
  state = createGame()
  trail = []
  wasTethered = false
  lastMilestone = 0
  accumulator = 0
  lastTime = performance.now() // an ad break can eat seconds; don't simulate them
}

/**
 * Ads run between runs, never during one, and only every few deaths — a break
 * after every single attempt would wreck the one-more-go loop this game lives
 * on. The retry itself never waits on the portal.
 */
let runsSinceAd = 0
function retry() {
  runsSinceAd++
  if (runsSinceAd >= 3) {
    runsSinceAd = 0
    commercialBreak(restart)
  } else {
    restart()
  }
}

function syncUi() {
  ui.height.textContent = `${state.height}m`
  ui.best.textContent = best > 0 ? `BEST ${best}m` : ''
  ui.meter.style.transform = `scaleX(${windFraction(state)})`

  if (state.phase === 'ready') {
    // The prompt follows what they've actually done, so the two halves of the
    // control are taught one at a time instead of both at once.
    ui.overlay.dataset.show = 'ready'
    ui.title.textContent = state.armed ? 'LET GO' : 'HOLD'
    ui.detail.textContent = state.armed ? 'release to fly' : 'hold to wind up'
  } else if (state.phase === 'dead') {
    ui.overlay.dataset.show = 'dead'
    ui.title.textContent = `${state.height}m`
    ui.detail.textContent =
      state.height >= best && state.height > 0 ? 'new best · tap to retry' : 'tap to retry'
  } else {
    ui.overlay.dataset.show = 'playing'
  }
}

function step(dt, holding) {
  const before = state
  state = update(state, dt, { holding })

  // Sound is driven by comparing frames, so the rules stay free of side effects.
  const tethered = state.tether !== null
  if (tethered && !wasTethered) sfx.grab()
  if (!tethered && wasTethered) {
    if (before.tether && before.tether.star.charge <= 0) sfx.burnout()
    else sfx.fling(windFraction(before))
  }
  wasTethered = tethered

  if (state.height >= lastMilestone + 100) {
    lastMilestone = Math.floor(state.height / 100) * 100
    sfx.milestone()
  }

  if (before.phase === 'ready' && state.phase === 'playing') {
    gameplayStart()
    sfx.fling(windFraction(before))
  }

  if (state.phase === 'dead' && before.phase !== 'dead') {
    gameplayStop()
    sfx.death()
    deadAt = clock
    if (state.height > best) {
      best = state.height
      saveBest(best)
    }
  }
}

function frame(now) {
  const elapsed = Math.min((now - lastTime) / 1000, MAX_FRAME)
  lastTime = now
  clock += elapsed

  if (paused) {
    present()
    requestAnimationFrame(frame)
    return
  }

  if (state.phase === 'dead') {
    // Short lockout so the death isn't skipped by the tap that caused it.
    if (input.consumePress() && clock - deadAt > 0.6) retry()
  } else {
    if (input.consumePress()) sfx.unlock()
    accumulator += elapsed
    while (accumulator >= STEP) {
      step(STEP, input.holding)
      accumulator -= STEP
      pushTrail()
    }
  }

  present()
  requestAnimationFrame(frame)
}

function pushTrail() {
  if (state.phase !== 'playing') return
  trail.push({ x: state.player.x, y: state.player.y })
  if (trail.length > TRAIL_LENGTH) trail.shift()
}

function present() {
  draw(ctx, state, view, trail, clock)
  syncUi()
}

ui.mute.addEventListener('pointerdown', e => {
  e.stopPropagation()
  ui.mute.textContent = toggleMute() ? '♪̸' : '♪'
})
ui.mute.textContent = isMuted() ? '♪̸' : '♪'

// Debug hook for playtesting from the console. `sim` drives the game without
// relying on requestAnimationFrame, which browsers throttle hard whenever the
// tab isn't visible — otherwise automated playtests run in slow motion or not
// at all.
window.__slingstar = {
  get state() {
    return state
  },
  restart,
  /** Freeze the live loop so a scripted state can be inspected or captured. */
  get pause() {
    return paused
  },
  set pause(value) {
    paused = Boolean(value)
  },
  sim(frames, holding) {
    for (let i = 0; i < frames; i++) {
      step(STEP, holding)
      pushTrail()
      clock += STEP
    }
    present()
    return state.phase
  },
}

window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)
resize()
// The loop starts immediately; portal handshaking happens alongside it so a
// slow or blocked SDK can never keep the game from being playable.
initPortal()
requestAnimationFrame(frame)
