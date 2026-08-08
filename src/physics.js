// Pure motion math. No canvas, no DOM, no globals — every function takes state
// and returns new state, so the whole simulation is testable in node.

export const GRAVITY = 1100 // px/s², tuned so a free fall reads as "heavy" not floaty
export const TETHER_RANGE = 230 // px — how far a star can reach out and grab you
export const MIN_TETHER_RADIUS = 70 // px — floor if you grab one at point-blank range
export const MAX_SPEED = 2200 // px/s — clamp so a lucky slingshot can't break the camera

// Grab reach and orbit size are deliberately different numbers. The reach is
// generous so the tether feels like it wants to help you; the orbit is tight so
// the whole circle stays on screen and never swings you into a wall.
export const ORBIT_RADIUS = 110 // px — every orbit settles to this
export const REEL_SPEED = 700 // px/s pulling you in to that radius; fast enough to read as a yank

// Orbit spin-up. Holding on winds you faster; releasing fires you along the
// tangent. See stepOrbit for why the orbit is powered rather than a pendulum.
export const SPIN_ACCEL = 11 // rad/s² gained while holding on — a full wind-up takes about a second
export const MAX_SPIN = 13 // rad/s ceiling — ~1430px/s launch, clears a band with room to spare
export const MIN_SPIN = 2.2 // rad/s — even a dead-stop grab visibly orbits

/** Distance between two points. */
export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by)
}

/** Clamp a body's speed, preserving direction. Returns a new body. */
export function clampSpeed(body, max = MAX_SPEED) {
  const speed = Math.hypot(body.vx, body.vy)
  if (speed <= max) return body
  const k = max / speed
  return { ...body, vx: body.vx * k, vy: body.vy * k }
}

/**
 * Free flight: gravity accelerates the body, then it moves.
 * Semi-implicit Euler — velocity updates before position, which stays stable
 * at the frame rates a browser actually delivers.
 */
export function stepFree(body, dt, gravity = GRAVITY) {
  const vy = body.vy + gravity * dt
  return clampSpeed({
    x: body.x + body.vx * dt,
    y: body.y + vy * dt,
    vx: body.vx,
    vy,
  })
}

// --- Tethered motion -------------------------------------------------------
//
// The orbit is powered, not a free pendulum. A real pendulum conserves energy,
// so it can never carry you above its anchor; the only way to add energy is to
// reel in at the bottom of each swing, which is genuine playground-swing
// technique and far too subtle to read in the ten seconds a portal player will
// give you. A powered orbit trades physical purity for legibility: you can see
// yourself winding up, and the release is completely predictable.
//
// Gravity is suspended while tethered, so the orbit draws a clean circle.
//
// Convention: angle 0 hangs straight down from the anchor.
//   position = anchor + r * (sin θ, cos θ)      (canvas y grows downward)
//   velocity = ω * r * (cos θ, −sin θ)

/** Build orbit state from a body's position and velocity around a star. */
export function attach(body, star) {
  const dx = body.x - star.x
  const dy = body.y - star.y
  const r = Math.min(TETHER_RANGE, Math.max(MIN_TETHER_RADIUS, Math.hypot(dx, dy)))
  const theta = Math.atan2(dx, dy)
  // Keep orbiting the way you were already travelling — reversing your
  // direction on contact feels like a collision, not a grab.
  const tangential = body.vx * Math.cos(theta) - body.vy * Math.sin(theta)
  const direction = tangential < 0 ? -1 : 1
  const spin = Math.max(MIN_SPIN, Math.abs(tangential) / r)
  return { r, theta, omega: direction * Math.min(spin, MAX_SPIN) }
}

/**
 * Wind the orbit up. Angular speed climbs toward MAX_SPIN for as long as you
 * hold on, and linear speed is capped so a wide orbit can't outrun the camera.
 */
export function stepOrbit(orbit, dt, winding = true) {
  // Draw in toward the standard orbit, so however you arrived, the circle you
  // end up flying is the same one every time.
  const step = REEL_SPEED * dt
  const r = orbit.r > ORBIT_RADIUS
    ? Math.max(ORBIT_RADIUS, orbit.r - step)
    : Math.min(ORBIT_RADIUS, orbit.r + step)

  // `winding` off means the orbit coasts at its current speed — used before the
  // run starts, so the opening orbit turns invitingly without charging up.
  const direction = orbit.omega < 0 ? -1 : 1
  const target = winding ? Math.abs(orbit.omega) + SPIN_ACCEL * dt : Math.abs(orbit.omega)
  const capped = Math.min(target, MAX_SPIN, MAX_SPEED / r)
  const omega = direction * capped
  return { r, omega, theta: orbit.theta + omega * dt }
}

/** Convert orbit state back into a body in world space. */
export function orbitToBody(orbit, star) {
  const sin = Math.sin(orbit.theta)
  const cos = Math.cos(orbit.theta)
  const speed = orbit.omega * orbit.r
  return clampSpeed({
    x: star.x + orbit.r * sin,
    y: star.y + orbit.r * cos,
    vx: speed * cos,
    vy: -speed * sin,
  })
}

/** Launch speed if released right now — what the player is really choosing. */
export function orbitSpeed(orbit) {
  return Math.abs(orbit.omega * orbit.r)
}

/**
 * Nearest star within grabbing range, or null. Burnt-out stars are skipped —
 * they're scenery, not anchors.
 */
export function findAnchor(stars, x, y, range = TETHER_RANGE) {
  let best = null
  let bestDist = Infinity
  for (const star of stars) {
    if (star.charge <= 0) continue
    const d = dist(x, y, star.x, star.y)
    if (d <= range && d < bestDist) {
      bestDist = d
      best = star
    }
  }
  return best
}
