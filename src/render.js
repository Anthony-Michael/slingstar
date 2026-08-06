// All drawing. Everything here is procedural — no image files, no fonts to
// download — which is what keeps the whole game a few tens of kilobytes and
// well inside the 8MB portals allow for a first playable.

import { ORBIT_RADIUS, TETHER_RANGE, MAX_SPIN, orbitSpeed } from './physics.js'
import { VIEW_HEIGHT, PLAYER_RADIUS } from './game.js'
import { WORLD_WIDTH } from './world.js'

const GOLD = '#ffc94d'
const EMBER = '#ff7a59'
const VOID_EDGE = '#ff4d6d'
const PLAYER_GLOW = '#8ff3ff'

/** Sky colour shifts with altitude, so climbing visibly takes you somewhere. */
function skyAt(height) {
  const t = height / 900
  const hue = 248 - Math.sin(t) * 40
  const lift = Math.min(18, height / 90)
  return {
    top: `hsl(${hue}, 58%, ${4 + lift * 0.5}%)`,
    bottom: `hsl(${hue + 18}, 62%, ${11 + lift}%)`,
  }
}

/** Cheap deterministic hash — used to scatter background stars infinitely. */
function hash(i, j) {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Background starfield at two parallax depths. Generated from cell coordinates
 * rather than stored, so it scrolls forever without allocating anything.
 */
function drawBackdrop(ctx, cameraY, height) {
  const sky = skyAt(height)
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT)
  grad.addColorStop(0, sky.top)
  grad.addColorStop(1, sky.bottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, WORLD_WIDTH, VIEW_HEIGHT)

  for (const [depth, size, alpha] of [[0.25, 1.4, 0.5], [0.55, 2.2, 0.8]]) {
    const cell = 90
    const shift = cameraY * depth
    const firstRow = Math.floor((shift - cell) / cell)
    const rows = Math.ceil(VIEW_HEIGHT / cell) + 2
    for (let j = firstRow; j < firstRow + rows; j++) {
      for (let i = 0; i < Math.ceil(WORLD_WIDTH / cell); i++) {
        const x = (i + hash(i, j)) * cell
        const y = (j + hash(j, i)) * cell - shift
        const twinkle = 0.45 + 0.55 * hash(i + 7, j - 3)
        ctx.globalAlpha = alpha * twinkle
        ctx.fillStyle = '#cfd8ff'
        ctx.fillRect(x, y, size, size)
      }
    }
  }
  ctx.globalAlpha = 1
}

/** A star: glowing core, plus a ring showing how much life it has left. */
function drawStar(ctx, star, isAnchor, time) {
  const life = Math.max(0, star.charge / star.maxCharge)
  const radius = 13 + life * 9
  const pulse = 1 + Math.sin(time * 3 + star.twinkle) * 0.06

  if (life <= 0) {
    // Burnt out: a cold cinder. Still visible, so the field reads as used-up
    // rather than simply empty.
    ctx.globalAlpha = 0.32
    ctx.fillStyle = '#5b5570'
    ctx.beginPath()
    ctx.arc(star.x, star.y, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    return
  }

  const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius * 3.4)
  glow.addColorStop(0, `rgba(255, 214, 120, ${0.5 * life + 0.2})`)
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(star.x, star.y, radius * 3.4, 0, Math.PI * 2)
  ctx.fill()

  // Charge ring — the clearest signal that a star is a resource being spent.
  ctx.strokeStyle = life > 0.35 ? GOLD : EMBER
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(star.x, star.y, radius + 9, -Math.PI / 2, -Math.PI / 2 + life * Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = life > 0.35 ? '#fff3d0' : EMBER
  ctx.beginPath()
  ctx.arc(star.x, star.y, radius * pulse, 0, Math.PI * 2)
  ctx.fill()

  if (isAnchor) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(star.x, star.y, ORBIT_RADIUS, 0, Math.PI * 2)
    ctx.stroke()
  }
}

/** The tether, brightening and thickening as the orbit winds up. */
function drawTether(ctx, player, star, orbit) {
  const wind = Math.min(1, Math.abs(orbit.omega) / MAX_SPIN)
  ctx.strokeStyle = `rgba(255, 236, 190, ${0.4 + wind * 0.6})`
  ctx.lineWidth = 1.5 + wind * 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(star.x, star.y)
  ctx.lineTo(player.x, player.y)
  ctx.stroke()
}

/** Faint ring on the nearest grabbable star, so reach is never a guess. */
function drawReachHint(ctx, star) {
  ctx.strokeStyle = 'rgba(143, 243, 255, 0.16)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 10])
  ctx.beginPath()
  ctx.arc(star.x, star.y, TETHER_RANGE, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawTrail(ctx, trail) {
  for (let i = 0; i < trail.length; i++) {
    const t = i / trail.length
    ctx.globalAlpha = t * 0.5
    ctx.fillStyle = PLAYER_GLOW
    ctx.beginPath()
    ctx.arc(trail[i].x, trail[i].y, PLAYER_RADIUS * t * 0.85, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawPlayer(ctx, player) {
  const glow = ctx.createRadialGradient(
    player.x, player.y, 0,
    player.x, player.y, PLAYER_RADIUS * 4,
  )
  glow.addColorStop(0, 'rgba(143, 243, 255, 0.55)')
  glow.addColorStop(1, 'rgba(143, 243, 255, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(player.x, player.y, PLAYER_RADIUS * 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2)
  ctx.fill()
}

/** The rising collapse, with a restless edge so it reads as alive. */
function drawCollapse(ctx, collapseY, cameraY, time) {
  const top = collapseY
  if (top > cameraY + VIEW_HEIGHT + 60) return

  ctx.beginPath()
  ctx.moveTo(0, top + 40)
  for (let x = 0; x <= WORLD_WIDTH; x += 20) {
    const wave = Math.sin(x * 0.02 + time * 2.4) * 9 + Math.sin(x * 0.05 - time * 3.1) * 5
    ctx.lineTo(x, top + wave)
  }
  ctx.lineTo(WORLD_WIDTH, cameraY + VIEW_HEIGHT + 200)
  ctx.lineTo(0, cameraY + VIEW_HEIGHT + 200)
  ctx.closePath()

  const grad = ctx.createLinearGradient(0, top - 40, 0, top + 260)
  grad.addColorStop(0, 'rgba(255, 77, 109, 0.85)')
  grad.addColorStop(0.12, 'rgba(120, 16, 48, 0.95)')
  grad.addColorStop(1, '#12030c')
  ctx.fillStyle = grad
  ctx.fill()

  ctx.strokeStyle = VOID_EDGE
  ctx.lineWidth = 2.5
  ctx.stroke()
}

/**
 * Draw a frame. `view` maps design space onto the real canvas; `trail` is the
 * player's recent positions, kept by the caller.
 */
export function draw(ctx, state, view, trail, time) {
  const { player, stars, tether, cameraY, collapseY } = state

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#05040f'
  ctx.fillRect(0, 0, view.width, view.height)

  ctx.save()
  ctx.translate(view.offsetX, view.offsetY)
  ctx.scale(view.scale, view.scale)

  // Clip to the play area so glow never bleeds into the letterbox.
  ctx.beginPath()
  ctx.rect(0, 0, WORLD_WIDTH, VIEW_HEIGHT)
  ctx.clip()

  drawBackdrop(ctx, cameraY, state.height)

  ctx.translate(0, -cameraY)

  drawCollapse(ctx, collapseY, cameraY, time)

  const visible = stars.filter(
    s => s.y > cameraY - 120 && s.y < cameraY + VIEW_HEIGHT + 120,
  )

  if (!tether) {
    const reachable = visible
      .filter(s => s.charge > 0)
      .filter(s => Math.hypot(s.x - player.x, s.y - player.y) <= TETHER_RANGE)
      .sort(
        (a, b) =>
          Math.hypot(a.x - player.x, a.y - player.y) -
          Math.hypot(b.x - player.x, b.y - player.y),
      )[0]
    if (reachable) drawReachHint(ctx, reachable)
  }

  for (const star of visible) {
    drawStar(ctx, star, tether ? star === tether.star : false, time)
  }

  if (tether) drawTether(ctx, player, tether.star, tether.orbit)
  drawTrail(ctx, trail)
  drawPlayer(ctx, player)

  ctx.restore()
}

/** Launch speed as a 0..1 fraction of the maximum — drives the HUD meter. */
export function windFraction(state) {
  if (!state.tether) return 0
  return Math.min(1, orbitSpeed(state.tether.orbit) / (MAX_SPIN * ORBIT_RADIUS))
}
