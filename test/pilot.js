// A reference player, used to prove the game is actually climbable.
//
// It only knows what a person can see: where the stars are, how fast it's
// spinning, and which way it's pointing. If this can't climb, no human will.

import { TETHER_RANGE, GRAVITY, dist, orbitSpeed } from '../src/physics.js'

/** Returns an input function to feed to `update`. */
export function makePilot({ aim = 0.9 } = {}) {
  let lastBand = -1

  return function pilot(state) {
    const { player, tether } = state

    // Always heading for the lowest star still above the last one used.
    const target = state.stars
      .filter(s => s.charge > 0 && s.band > lastBand)
      .sort((a, b) => a.band - b.band)[0]

    if (tether) {
      lastBand = tether.star.band
      if (!target) return { holding: false }

      const gap = dist(player.x, player.y, target.x, target.y)
      const speed = Math.hypot(player.vx, player.vy)
      // Enough launch speed to out-climb gravity to the target, plus margin.
      const rise = Math.max(0, player.y - target.y)
      const needed = Math.sqrt(2 * GRAVITY * rise) * 1.2

      const aimed =
        (player.vx / speed) * ((target.x - player.x) / gap) +
        (player.vy / speed) * ((target.y - player.y) / gap) > aim

      return { holding: !(aimed && orbitSpeed(tether.orbit) >= Math.max(500, needed)) }
    }

    // Airborne: grab whatever is in reach. A real player who misses their jump
    // takes the star they can get rather than falling to their death.
    return {
      holding: state.stars.some(
        s => s.charge > 0 && dist(player.x, player.y, s.x, s.y) <= TETHER_RANGE,
      ),
    }
  }
}
