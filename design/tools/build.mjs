// Generates the Slingstar submission art pack as .dc.html artboards.
//
// Every colour and proportion traces back to src/render.js and index.html; the
// gameplay plates are real captured frames, not drawings of them.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { sceneSvg, starfield, skyAt } from './scene-svg.mjs'

const OUT = new URL('..', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const scenes = JSON.parse(readFileSync(new URL('./scenes.json', import.meta.url)))

const f = n => Number(n.toFixed(2))
const FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, -apple-system, sans-serif'
const INK = '#fff6e0'
const DIM = 'rgba(255, 246, 224, 0.55)'
const GOLD = '#ffc94d'
const EMBER = '#ff7a59'

// --- The mark -------------------------------------------------------------
// One motif, authored once in a 512 box: the anchor star with its charge ring
// part-spent, the orbit, and the player mid-swing. Rendered at every size from
// the same geometry so the icon and the favicon can never disagree.

function mark(p) {
  const cx = 256
  const cy = 268
  const swingR = 192
  const theta = 2.3
  const px = cx + swingR * Math.sin(theta)
  const py = cy + swingR * Math.cos(theta)
  const defs = []
  const body = []

  defs.push(
    `<radialGradient id="${p}-bg" gradientUnits="userSpaceOnUse" cx="256" cy="230" r="400">` +
      `<stop offset="0" stop-color="hsl(244, 58%, 14%)"/>` +
      `<stop offset="1" stop-color="#05040f"/></radialGradient>`,
    `<radialGradient id="${p}-glow" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="250">` +
      `<stop offset="0" stop-color="rgba(255, 214, 120, 0.62)"/>` +
      `<stop offset="1" stop-color="rgba(255, 190, 90, 0)"/></radialGradient>`,
    `<radialGradient id="${p}-pglow" gradientUnits="userSpaceOnUse" cx="${f(px)}" cy="${f(py)}" r="160">` +
      `<stop offset="0" stop-color="rgba(143, 243, 255, 0.62)"/>` +
      `<stop offset="1" stop-color="rgba(143, 243, 255, 0)"/></radialGradient>`,
  )

  const field =
    `<rect width="512" height="512" fill="url(#${p}-bg)"/>` + starfield(512, 512, 120, 1.5)

  body.push(`<circle cx="${cx}" cy="${cy}" r="250" fill="url(#${p}-glow)"/>`)

  // No orbit ring: at 32px and below a second concentric stroke turns the mark
  // to mud. The trail arc implies the circle, and the charge ring carries the
  // idea the whole game turns on — a star being spent.
  for (let k = 5; k >= 1; k--) {
    const t = theta - k * 0.26
    body.push(
      `<circle cx="${f(cx + swingR * Math.sin(t))}" cy="${f(cy + swingR * Math.cos(t))}" ` +
        `r="${f(50 * (1 - k * 0.16))}" fill="#8ff3ff" opacity="${f(0.40 * (1 - k * 0.17))}"/>`,
    )
  }

  const life = 0.72
  const ringR = 158
  const a0 = -Math.PI / 2
  const a1 = a0 + life * Math.PI * 2
  body.push(
    `<path d="M ${f(cx + ringR * Math.cos(a0))} ${f(cy + ringR * Math.sin(a0))} ` +
      `A ${ringR} ${ringR} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ` +
      `${f(cx + ringR * Math.cos(a1))} ${f(cy + ringR * Math.sin(a1))}" ` +
      `fill="none" stroke="${GOLD}" stroke-width="30" stroke-linecap="round"/>`,
  )

  // Tether first, then the core over it, so the line emerges from the star.
  body.push(
    `<line x1="${cx}" y1="${cy}" x2="${f(px)}" y2="${f(py)}" stroke="rgba(255, 236, 190, 0.95)" stroke-width="14" stroke-linecap="round"/>`,
  )
  body.push(`<circle cx="${cx}" cy="${cy}" r="100" fill="#fff3d0"/>`)
  body.push(`<circle cx="${f(px)}" cy="${f(py)}" r="160" fill="url(#${p}-pglow)"/>`)
  body.push(`<circle cx="${f(px)}" cy="${f(py)}" r="54" fill="#ffffff"/>`)

  return { defs: defs.join(''), field, motif: body.join('') }
}

// The motif is inset inside the field: every platform masks an icon to a
// rounded shape and some crop further, so the mark needs its own margin.
const ICON_INSET = 0.84

function markSvg(p, size, extraStyle = '') {
  const m = mark(p)
  return (
    `<svg viewBox="0 0 512 512" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" ` +
    `style="display: block;${extraStyle}" aria-hidden="true"><defs>${m.defs}</defs>${m.field}` +
    `<g transform="translate(256 256) scale(${ICON_INSET}) translate(-256 -256)">${m.motif}</g></svg>`
  )
}

// --- Key-art scenery ------------------------------------------------------

/** The collapse, as a band across the foot of a piece of key art. */
function collapseBand(w, top, bottom, time, defs, id) {
  const pts = [`M 0 ${f(top + 40)}`]
  for (let x = 0; x <= w; x += 20) {
    const wave = Math.sin(x * 0.012 + time * 2.4) * 14 + Math.sin(x * 0.03 - time * 3.1) * 8
    pts.push(`L ${x} ${f(top + wave)}`)
  }
  pts.push(`L ${w} ${bottom}`, `L 0 ${bottom}`, 'Z')
  // Compressed against the band's real height — spread over the game's 300px
  // falloff the crimson never reaches the visible strip and it reads as a
  // letterbox bar rather than the thing that is chasing you.
  defs.push(
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(top - 8)}" x2="0" y2="${f(top + 130)}">` +
      `<stop offset="0" stop-color="rgba(255, 77, 109, 0.85)"/>` +
      `<stop offset="0.12" stop-color="rgba(120, 16, 48, 0.95)"/>` +
      `<stop offset="1" stop-color="#12030c"/></linearGradient>`,
  )
  return `<path d="${pts.join(' ')}" fill="url(#${id})" stroke="#ff4d6d" stroke-width="3"/>`
}

/**
 * The hero moment: wound up on the ring, tether taut, one more star above.
 * Same anatomy as the game draws, scaled up for art that is viewed large.
 */
function heroArt(w, h, p, { starX, starY, orbitR, nextX, nextY }) {
  const defs = []
  const body = []
  const theta = 2.5
  const px = starX + orbitR * Math.sin(theta)
  const py = starY + orbitR * Math.cos(theta)

  const sky = skyAt(500)
  defs.push(
    `<linearGradient id="${p}-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${h}">` +
      `<stop offset="0" stop-color="${sky.top}"/><stop offset="1" stop-color="${sky.bottom}"/></linearGradient>`,
    `<radialGradient id="${p}-sglow" gradientUnits="userSpaceOnUse" cx="${starX}" cy="${starY}" r="240">` +
      `<stop offset="0" stop-color="rgba(255, 214, 120, 0.60)"/>` +
      `<stop offset="1" stop-color="rgba(255, 190, 90, 0)"/></radialGradient>`,
    `<radialGradient id="${p}-nglow" gradientUnits="userSpaceOnUse" cx="${nextX}" cy="${nextY}" r="150">` +
      `<stop offset="0" stop-color="rgba(255, 214, 120, 0.52)"/>` +
      `<stop offset="1" stop-color="rgba(255, 190, 90, 0)"/></radialGradient>`,
    `<radialGradient id="${p}-pglow" gradientUnits="userSpaceOnUse" cx="${f(px)}" cy="${f(py)}" r="130">` +
      `<stop offset="0" stop-color="rgba(143, 243, 255, 0.60)"/>` +
      `<stop offset="1" stop-color="rgba(143, 243, 255, 0)"/></radialGradient>`,
  )

  body.push(`<rect width="${w}" height="${h}" fill="url(#${p}-sky)"/>`)
  body.push(starfield(w, h, -3914, 1.4))
  body.push(collapseBand(w, h - 76, h + 30, 2.1, defs, `${p}-collapse`))

  // The next star up, with the reach hint the game shows when you are loose.
  body.push(
    `<circle cx="${nextX}" cy="${nextY}" r="150" fill="url(#${p}-nglow)"/>`,
    `<circle cx="${nextX}" cy="${nextY}" r="88" fill="none" stroke="rgba(143, 243, 255, 0.16)" stroke-width="2" stroke-dasharray="8 13"/>`,
    `<circle cx="${nextX}" cy="${nextY}" r="42" fill="none" stroke="${GOLD}" stroke-width="5"/>`,
    `<circle cx="${nextX}" cy="${nextY}" r="29" fill="#fff3d0"/>`,
  )

  // Anchor star: orbit ring, charge ring most of the way spent, hot core.
  body.push(`<circle cx="${starX}" cy="${starY}" r="240" fill="url(#${p}-sglow)"/>`)
  body.push(
    `<circle cx="${starX}" cy="${starY}" r="${orbitR}" fill="none" stroke="rgba(255, 255, 255, 0.28)" stroke-width="3"/>`,
  )
  const life = 0.62
  const a0 = -Math.PI / 2
  const a1 = a0 + life * Math.PI * 2
  const rr = 68
  body.push(
    `<path d="M ${f(starX + rr * Math.cos(a0))} ${f(starY + rr * Math.sin(a0))} ` +
      `A ${rr} ${rr} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f(starX + rr * Math.cos(a1))} ${f(starY + rr * Math.sin(a1))}" ` +
      `fill="none" stroke="${GOLD}" stroke-width="8" stroke-linecap="round"/>`,
  )
  body.push(`<circle cx="${starX}" cy="${starY}" r="48" fill="#fff3d0"/>`)

  // Spaced well inside the dot radius so the trail reads as one motion streak
  // rather than a string of beads.
  for (let k = 16; k >= 1; k--) {
    const t = theta - k * 0.07
    body.push(
      `<circle cx="${f(starX + orbitR * Math.sin(t))}" cy="${f(starY + orbitR * Math.cos(t))}" ` +
        `r="${f(22 * (1 - k * 0.048))}" fill="#8ff3ff" opacity="${f(0.30 * (1 - k * 0.055))}"/>`,
    )
  }

  body.push(
    `<line x1="${starX}" y1="${starY}" x2="${f(px)}" y2="${f(py)}" stroke="rgba(255, 236, 190, 0.95)" stroke-width="7" stroke-linecap="round"/>`,
    `<circle cx="${f(px)}" cy="${f(py)}" r="130" fill="url(#${p}-pglow)"/>`,
    `<circle cx="${f(px)}" cy="${f(py)}" r="26" fill="#ffffff"/>`,
  )

  return (
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" ` +
    `style="position: absolute; inset: 0; display: block;" aria-hidden="true">` +
    `<defs>${defs.join('')}</defs>${body.join('')}</svg>`
  )
}

// --- The game's own HUD, rebuilt from index.html --------------------------
// Values are the shipped ones; inline so every one of them is editable.

function hud({ height, best, meter, overlay }) {
  const o = overlay
    ? `
    <div style="margin: auto auto max(9vh, 60px); text-align: center;">
      <div style="font-size: clamp(40px, 13vw, 68px); font-weight: 800; letter-spacing: 0.02em; text-shadow: 0 4px 30px rgba(0, 0, 0, 0.7); color: ${INK};">${overlay.title}</div>
      <div style="margin-top: 6px; font-size: clamp(12px, 3.4vw, 15px); font-weight: 600; letter-spacing: 0.06em; color: ${DIM};">${overlay.detail}</div>
    </div>`
    : ''
  return `
  <div style="position: absolute; inset: 0; display: flex; flex-direction: column; padding: 14px 16px 16px; pointer-events: none;">
    <div style="display: flex; align-items: baseline; gap: 12px;">
      <div style="font-size: clamp(30px, 8vw, 44px); font-weight: 800; letter-spacing: -0.02em; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6); font-variant-numeric: tabular-nums; color: ${INK};">${height}</div>
      <div style="font-size: clamp(11px, 3vw, 13px); font-weight: 700; letter-spacing: 0.14em; color: ${DIM};">${best}</div>
    </div>
    <div style="margin-top: 8px; width: min(190px, 44vw); height: 5px; border-radius: 99px; background: rgba(255, 255, 255, 0.12); overflow: hidden;">
      <div style="width: 100%; height: 100%; border-radius: 99px; background: linear-gradient(90deg, ${GOLD}, ${EMBER}); transform: scaleX(${meter}); transform-origin: left;"></div>
    </div>
    <div style="position: absolute; top: 14px; right: 16px; width: 38px; height: 38px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); color: ${DIM}; font-size: 17px; line-height: 38px; text-align: center;">&#9834;</div>${o}
  </div>`
}

// --- Artboard shell -------------------------------------------------------

function dc(w, h, inner, extraCss = '') {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; font-family: ${FONT}; background: #05040f; }
    a { color: ${GOLD}; } a:hover { color: ${EMBER}; }
${extraCss}  </style>
</helmet>
<div style="position: relative; width: ${w}px; height: ${h}px; overflow: hidden; background: #05040f; color: ${INK};">
${inner}
</div>
</x-dc>
</body>
</html>
`
}

const files = {}

// --- 1. Portal cover, 1280x720 -------------------------------------------

files['Main.dc.html'] = dc(
  1280,
  720,
  `${heroArt(1280, 720, 'cv', { starX: 880, starY: 452, orbitR: 210, nextX: 1168, nextY: 168 })}
  <div style="position: absolute; left: 88px; top: 0; height: 720px; width: 620px; display: flex; flex-direction: column; justify-content: center; gap: 26px;">
    <div style="font-size: 104px; font-weight: 800; letter-spacing: -0.035em; line-height: 0.92; color: ${INK}; text-shadow: 0 6px 42px rgba(0, 0, 0, 0.72);">SLINGSTAR</div>
    <div style="width: 232px; height: 8px; border-radius: 99px; background: linear-gradient(90deg, ${GOLD}, ${EMBER});"></div>
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 37px; font-weight: 700; letter-spacing: -0.005em; line-height: 1.24; color: ${INK}; text-wrap: pretty; text-shadow: 0 3px 22px rgba(0, 0, 0, 0.7);">Hold to swing.<br>Let go to fly.</div>
      <div style="font-size: 22px; font-weight: 600; letter-spacing: 0.045em; color: ${DIM};">Climb before the collapse takes you.</div>
    </div>
  </div>`,
)

// --- 2. OG / social card, 1200x630 ---------------------------------------

files['OGCard.dc.html'] = dc(
  1200,
  630,
  `${heroArt(1200, 630, 'og', { starX: 880, starY: 396, orbitR: 178, nextX: 1116, nextY: 146 })}
  <div style="position: absolute; left: 76px; top: 0; height: 630px; width: 588px; display: flex; flex-direction: column; justify-content: center; gap: 22px;">
    <div style="display: flex; align-items: center; gap: 20px;">
      ${markSvg('ogm', 76, ' border-radius: 17px;')}
      <div style="font-size: 74px; font-weight: 800; letter-spacing: -0.035em; line-height: 1; color: ${INK};">SLINGSTAR</div>
    </div>
    <div style="width: 190px; height: 7px; border-radius: 99px; background: linear-gradient(90deg, ${GOLD}, ${EMBER});"></div>
    <div style="font-size: 31px; font-weight: 700; line-height: 1.34; color: ${INK}; text-shadow: 0 3px 22px rgba(0, 0, 0, 0.7);">Hold to swing. Let go to fly.</div>
    <div style="font-size: 19px; font-weight: 700; letter-spacing: 0.11em; color: ${DIM};">ONE INPUT &middot; 42 KB &middot; NO BUILD STEP</div>
  </div>`,
)

// --- 3. App icon, 512x512 -------------------------------------------------

files['Icon.dc.html'] = dc(512, 512, markSvg('ic', 512))

// --- 4. Favicon legibility, dark and light chrome -------------------------

const SIZES = [128, 64, 32, 16]

function iconRow(prefix, bg, label, labelColor) {
  const cells = SIZES.map(
    (s, i) => `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
        ${markSvg(`${prefix}${i}`, s, ' border-radius: ' + Math.max(2, Math.round(s * 0.22)) + 'px;')}
        <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.1em; color: ${labelColor};">${s}</div>
      </div>`,
  ).join('')
  return `
  <div style="display: flex; flex-direction: column; gap: 14px;">
    <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.14em; color: ${DIM};">${label}</div>
    <div style="display: flex; align-items: flex-end; justify-content: center; gap: 62px; padding: 28px 34px; border-radius: 14px; background: ${bg};">${cells}</div>
  </div>`
}

files['IconSizes.dc.html'] = dc(
  820,
  548,
  `<div style="position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 30px; padding: 0 44px; background: #0d0b16;">
    ${iconRow('da', '#05040f', 'ON DARK TAB CHROME', 'rgba(255, 246, 224, 0.55)')}
    ${iconRow('li', '#f2eee4', 'ON LIGHT TAB CHROME', 'rgba(20, 16, 30, 0.62)')}
  </div>`,
)

// --- 5-7. Gameplay plates, real captured frames ---------------------------

const plates = [
  ['Screen.dc.html', scenes.playing, { height: '361m', best: 'BEST 505m', meter: 0.93, overlay: null }],
  ['ScreenOpen.dc.html', scenes.ready, {
    height: '0m', best: 'BEST 505m', meter: 0.17,
    overlay: { title: 'HOLD', detail: 'hold to wind up' },
  }],
  // The frame one tick before death: still tethered, winding up, nine pixels
  // clear of the collapse. A gameplay shot sells a portal listing better than
  // a game-over screen does.
  ['ScreenPressure.dc.html', scenes.deathPrev, {
    height: '361m', best: 'BEST 505m', meter: 0.55, overlay: null,
  }],
]

for (const [name, scene, h] of plates) {
  const p = name.replace('.dc.html', '').toLowerCase()
  files[name] = dc(
    540,
    960,
    `  <div style="position: absolute; inset: 0;">${sceneSvg(scene, { prefix: p })}</div>${hud(h)}`,
  )
}

// --- canvas.json ----------------------------------------------------------

const canvas = {
  artboards: [
    { file: 'Main.dc.html', x: 0, y: 0, w: 1280, h: 720, title: 'Portal cover — 1280×720' },
    { file: 'OGCard.dc.html', x: 1380, y: 0, w: 1200, h: 630, title: 'OG card — 1200×630' },
    { file: 'Icon.dc.html', x: 0, y: 880, w: 512, h: 512, title: 'App icon — 512×512' },
    { file: 'IconSizes.dc.html', x: 612, y: 880, w: 820, h: 548, title: 'Favicon legibility check' },
    { file: 'Screen.dc.html', x: 1612, y: 880, w: 540, h: 960, title: 'Screenshot 1 — mid-climb' },
    { file: 'ScreenOpen.dc.html', x: 2252, y: 880, w: 540, h: 960, title: 'Screenshot 2 — the opening' },
    { file: 'ScreenPressure.dc.html', x: 2892, y: 880, w: 540, h: 960, title: 'Screenshot 3 — the collapse closing in' },
  ],
  annotations: [
    {
      id: 'pack',
      x: 0,
      y: -230,
      w: 620,
      text:
        'Slingstar submission art\n\n' +
        'Everything a CrazyGames or Poki form asks for, in the game’s own palette:\n' +
        'gold → ember stars, cyan player, crimson collapse, #05040f void.\n\n' +
        'Export each board as PNG from the toolbar.',
    },
    {
      id: 'shots',
      x: 1612,
      y: 1900,
      w: 620,
      text:
        'The three screenshots are real frames — a headless run with the reference '
        + 'pilot, drawn with render.js’s own values. Nothing here is an artist’s '
        + 'impression of the game.',
    },
    {
      id: 'favicon',
      x: 612,
      y: 1400,
      w: 480,
      text:
        'Favicon check: the mark has to survive 16px, where the orbit ring and '
        + 'tether drop out and only the gold core and cyan dot carry it.',
    },
  ],
  launch: { view: 'canvas' },
}

files['canvas.json'] = JSON.stringify(canvas, null, 2) + '\n'

for (const [name, content] of Object.entries(files)) {
  writeFileSync(`${OUT}/${name}`, content)
  console.log(name.padEnd(22), String(content.length).padStart(7), 'bytes')
}
