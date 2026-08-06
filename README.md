# Slingstar

Hold to swing. Let go to fly. Climb before the collapse takes you.

A one-input browser game built to the submission requirements of the web game
portals (Poki, CrazyGames), where the distribution is the portal's traffic and
the revenue is an ad split — no store fees, no marketing, no support inbox.

## The game

You orbit a star. Holding on winds the orbit faster and faster; letting go fires
you off along the tangent. That single choice — *when to let go* — is the entire
skill.

Stars burn out while you hold them. The thing keeping you alive is consumed by
the act of using it, so you can never park in a safe orbit and wait. A collapse
rises from below and never falls far behind. Score is height.

## Why it's built this way

Every constraint here comes from what portals actually accept.

| Requirement | What it forced |
|---|---|
| Under 8 MB first playable (Poki) | Zero dependencies, zero build step, all art and audio generated procedurally. Ships at **39 KB** (14 KB gzipped) |
| Fun inside ten seconds, no tutorial | One input. The wind-up meter and the visibly-tightening tether teach the mechanic without a word of instruction |
| Portrait, mobile-first (CrazyGames) | 540×960 design space, letterboxed to any screen, one thumb, `touch-action: none` |
| No 1:1 clones (Poki) | Familiar swing-and-release genre, but stars are a consumable resource — that's the part that's ours |

### The orbit is powered, not a pendulum

The obvious implementation — a rope and gravity — does not work, and it took
building it to see why. A rigid pendulum conserves energy, so it can never carry
you above its anchor. You can only add energy by reeling in at the bottom of
each swing, which is real playground-swing technique and far too subtle to read
in the ten seconds a portal player will give you.

So the orbit is powered: hold on and you visibly wind up. It trades physical
purity for legibility, which is the correct trade for this audience.

A related trap is in `physics.js`: an earlier version moved the player along the
tangent and snapped the position back onto the circle each frame. That looks
right and quietly destroys energy — the chord always falls inside the arc, so
the correction drags you inward and the swing dies out. Integrating the angle
directly is exact. There's a test that holds a swing for 6,000 frames and
asserts the energy doesn't drift.

## Layout

```
index.html      shell, HUD, all CSS
src/physics.js  pure motion — free fall, orbits, spin-up      ← no DOM
src/world.js    seeded procedural star field                  ← no DOM
src/game.js     rules, scoring, the collapse                   ← no DOM
src/render.js   canvas drawing, entirely procedural
src/input.js    pointer/touch/keyboard → one boolean
src/audio.js    synthesised sound, no audio files
src/storage.js  best score, safe inside sandboxed iframes
src/portal.js   Poki / CrazyGames hooks; no-ops when absent
src/main.js     bootstrap and frame loop                       ← the only impure module
test/pilot.js   reference player used to prove it's climbable
```

The simulation is pure: `update(state, dt, input)` returns new state and touches
nothing else, so entire runs can be played headlessly in node.

## Tests

```bash
npm test
```

52 tests, no dependencies. The one that matters most is the reference pilot in
`test/pilot.js` — it plays using only what a person can see, and the suite
asserts it climbs on every seed. If that fails, the mechanic is broken and no
amount of art will save it. Current spread across twelve seeds: **65m worst,
120m median, 191m best**, over runs of 10–40 seconds.

## Running it

Any static server; there is no build step.

```bash
python3 -m http.server 4180
```

While playing, `window.__slingstar` exposes live state, plus `sim(frames, holding)`
which drives the game without `requestAnimationFrame` — browsers throttle rAF
hard when a tab isn't visible, so automated playtests need this to run at speed.

## Publishing

The game is submission-ready as-is. For either portal, add their SDK script tag
to `index.html`; `src/portal.js` detects whichever is present and wires up
gameplay start/stop and ad breaks. Nothing else changes, and the same build
still runs standalone.

Ads are requested every third death, never mid-run — a break after every attempt
would wreck the one-more-go loop the game depends on.

**Terms, as of the last check:** Poki splits ad revenue 50/50 on traffic they
send, 100% to you on traffic you bring. CrazyGames pays 60% of ad revenue and
70% of purchases. Non-exclusive licensing deals run roughly $300–800, exclusive
$5,000+. A well-performing casual game clears $200–2,000/month; it's hit-driven
and needs volume.
