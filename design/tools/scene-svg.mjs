// Turns a captured game state into SVG, porting src/render.js draw call for
// draw call. Every constant here is lifted from the game source, not chosen.

const WORLD_WIDTH = 540
const VIEW_HEIGHT = 960
const PLAYER_RADIUS = 13
const ORBIT_RADIUS = 110
const TETHER_RANGE = 230
const MAX_SPIN = 13

const GOLD = '#ffc94d'
const EMBER = '#ff7a59'
const VOID_EDGE = '#ff4d6d'

const f = n => Number(n.toFixed(2))

export function skyAt(height) {
  const t = height / 900
  const hue = 248 - Math.sin(t) * 40
  const lift = Math.min(18, height / 90)
  return {
    top: `hsl(${f(hue)}, 58%, ${f(4 + lift * 0.5)}%)`,
    bottom: `hsl(${f(hue + 18)}, 62%, ${f(11 + lift)}%)`,
  }
}

function hash(i, j) {
  const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/**
 * Two parallax layers of background stars, generated from cell coordinates
 * exactly as drawBackdrop does. `scale` enlarges the cell and mark for key art,
 * which is viewed far larger than the 540-wide play area.
 */
export function starfield(w, h, cameraY, scale = 1) {
  const out = []
  for (const [depth, size, alpha] of [[0.25, 1.4, 0.5], [0.55, 2.2, 0.8]]) {
    const cell = 90 * scale
    const mark = size * scale
    const shift = cameraY * depth
    const firstRow = Math.floor((shift - cell) / cell)
    const rows = Math.ceil(h / cell) + 2
    for (let j = firstRow; j < firstRow + rows; j++) {
      for (let i = 0; i < Math.ceil(w / cell); i++) {
        const x = (i + hash(i, j)) * cell
        const y = (j + hash(j, i)) * cell - shift
        if (y < -mark || y > h + mark) continue
        const twinkle = 0.45 + 0.55 * hash(i + 7, j - 3)
        out.push(
          `<rect x="${f(x)}" y="${f(y)}" width="${f(mark)}" height="${f(mark)}" fill="#cfd8ff" opacity="${f(alpha * twinkle)}"/>`,
        )
      }
    }
  }
  return out.join('')
}

const backdropStars = cameraY => starfield(WORLD_WIDTH, VIEW_HEIGHT, cameraY, 1)

/** SVG arc, clockwise in screen space to match canvas ctx.arc defaults. */
function arcPath(cx, cy, r, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0
  return (
    `M ${f(cx + r * Math.cos(a0))} ${f(cy + r * Math.sin(a0))} ` +
    `A ${f(r)} ${f(r)} 0 ${large} 1 ${f(cx + r * Math.cos(a1))} ${f(cy + r * Math.sin(a1))}`
  )
}

function star(s, isAnchor, time, id, defs) {
  const life = Math.max(0, s.charge / s.maxCharge)
  const radius = 13 + life * 9
  const pulse = 1 + Math.sin(time * 3 + s.twinkle) * 0.06

  if (life <= 0) {
    return `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="9" fill="#5b5570" opacity="0.32"/>`
  }

  const glowR = radius * 3.4
  defs.push(
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(s.x)}" cy="${f(s.y)}" r="${f(glowR)}">` +
      `<stop offset="0" stop-color="rgba(255, 214, 120, ${f(0.5 * life + 0.2)})"/>` +
      `<stop offset="1" stop-color="rgba(255, 190, 90, 0)"/>` +
      `</radialGradient>`,
  )

  const ringR = radius + 9
  const ringColor = life > 0.35 ? GOLD : EMBER
  const ring =
    life >= 0.999
      ? `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(ringR)}" fill="none" stroke="${ringColor}" stroke-width="3"/>`
      : `<path d="${arcPath(s.x, s.y, ringR, -Math.PI / 2, -Math.PI / 2 + life * Math.PI * 2)}" fill="none" stroke="${ringColor}" stroke-width="3" stroke-linecap="round"/>`

  return (
    `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(glowR)}" fill="url(#${id})"/>` +
    ring +
    `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(radius * pulse)}" fill="${life > 0.35 ? '#fff3d0' : EMBER}"/>` +
    (isAnchor
      ? `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${ORBIT_RADIUS}" fill="none" stroke="rgba(255, 255, 255, 0.28)" stroke-width="1.5"/>`
      : '')
  )
}

/**
 * The collapse. Everything here is WORLD space — this path is emitted inside
 * the camera-translated group alongside the stars, so mixing in a view-space
 * y puts the whole band a screenful off-canvas.
 */
function collapse(top, cameraY, time, defs, id) {
  if (top > cameraY + VIEW_HEIGHT + 60) return ''
  const foot = cameraY + VIEW_HEIGHT + 200
  const pts = [`M 0 ${f(top + 40)}`]
  for (let x = 0; x <= WORLD_WIDTH; x += 20) {
    const wave = Math.sin(x * 0.02 + time * 2.4) * 9 + Math.sin(x * 0.05 - time * 3.1) * 5
    pts.push(`L ${x} ${f(top + wave)}`)
  }
  pts.push(`L ${WORLD_WIDTH} ${f(foot)}`, `L 0 ${f(foot)}`, 'Z')
  defs.push(
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top - 40)}" x2="0" y2="${f(top + 260)}">` +
      `<stop offset="0" stop-color="rgba(255, 77, 109, 0.85)"/>` +
      `<stop offset="0.12" stop-color="rgba(120, 16, 48, 0.95)"/>` +
      `<stop offset="1" stop-color="#12030c"/>` +
      `</linearGradient>`,
  )
  return `<path d="${pts.join(' ')}" fill="url(#${id})" stroke="${VOID_EDGE}" stroke-width="2.5"/>`
}

/**
 * Build the game layer for one captured scene.
 *
 * `bind` opts swap a literal for a {{hole}} so a tweak can drive it live —
 * used only for the sky gradient and the tether, which are the two things
 * that visibly answer "how high am I" and "how wound up am I".
 */
export function sceneSvg(scene, { prefix = 's', bindSky = false, bindTether = false } = {}) {
  const cam = scene.cameraY
  const defs = []
  const body = []

  const sky = skyAt(scene.height)
  defs.push(
    `<linearGradient id="${prefix}-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${VIEW_HEIGHT}">` +
      `<stop offset="0" stop-color="${bindSky ? '{{sky.top}}' : sky.top}"/>` +
      `<stop offset="1" stop-color="${bindSky ? '{{sky.bottom}}' : sky.bottom}"/>` +
      `</linearGradient>`,
  )
  body.push(`<rect x="0" y="0" width="${WORLD_WIDTH}" height="${VIEW_HEIGHT}" fill="url(#${prefix}-sky)"/>`)
  body.push(backdropStars(cam))

  // Everything below is world space, shifted into view by the camera.
  const inner = []
  inner.push(collapse(scene.collapseY, cam, scene.time, defs, `${prefix}-collapse`))

  const anchor = scene.tetherBand
  if (anchor === null) {
    // No tether: the game hints at the nearest star you could still grab.
    const reachable = scene.stars
      .filter(s => s.charge > 0)
      .filter(s => Math.hypot(s.x - scene.player.x, s.y - scene.player.y) <= TETHER_RANGE)
      .sort(
        (a, b) =>
          Math.hypot(a.x - scene.player.x, a.y - scene.player.y) -
          Math.hypot(b.x - scene.player.x, b.y - scene.player.y),
      )[0]
    if (reachable) {
      inner.push(
        `<circle cx="${f(reachable.x)}" cy="${f(reachable.y)}" r="${TETHER_RANGE}" fill="none" stroke="rgba(143, 243, 255, 0.16)" stroke-width="1.5" stroke-dasharray="6 10"/>`,
      )
    }
  }

  scene.stars.forEach((s, n) => {
    inner.push(star(s, s.band === anchor, scene.time, `${prefix}-star${n}`, defs))
  })

  if (anchor !== null) {
    const s = scene.stars.find(st => st.band === anchor)
    const wind = Math.min(1, Math.abs(scene.orbit.omega) / MAX_SPIN)
    inner.push(
      `<line x1="${f(s.x)}" y1="${f(s.y)}" x2="${f(scene.player.x)}" y2="${f(scene.player.y)}" ` +
        `stroke="${bindTether ? '{{tether.stroke}}' : `rgba(255, 236, 190, ${f(0.4 + wind * 0.6)})`}" ` +
        `stroke-width="${bindTether ? '{{tether.width}}' : f(1.5 + wind * 3)}" stroke-linecap="round"/>`,
    )
  }

  scene.trail.forEach((p, i) => {
    const t = i / scene.trail.length
    if (t <= 0) return
    inner.push(
      `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(PLAYER_RADIUS * t * 0.85)}" fill="#8ff3ff" opacity="${f(t * 0.5)}"/>`,
    )
  })

  const pg = PLAYER_RADIUS * 4
  defs.push(
    `<radialGradient id="${prefix}-player" gradientUnits="userSpaceOnUse" cx="${f(scene.player.x)}" cy="${f(scene.player.y)}" r="${pg}">` +
      `<stop offset="0" stop-color="rgba(143, 243, 255, 0.55)"/>` +
      `<stop offset="1" stop-color="rgba(143, 243, 255, 0)"/>` +
      `</radialGradient>`,
  )
  inner.push(`<circle cx="${f(scene.player.x)}" cy="${f(scene.player.y)}" r="${pg}" fill="url(#${prefix}-player)"/>`)
  inner.push(`<circle cx="${f(scene.player.x)}" cy="${f(scene.player.y)}" r="${PLAYER_RADIUS}" fill="#ffffff"/>`)

  body.push(`<g transform="translate(0 ${f(-cam)})">${inner.join('')}</g>`)

  return (
    `<svg class="stage" viewBox="0 0 ${WORLD_WIDTH} ${VIEW_HEIGHT}" width="${WORLD_WIDTH}" height="${VIEW_HEIGHT}" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<defs>${defs.join('')}</defs>${body.join('')}</svg>`
  )
}
