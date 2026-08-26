# Submission art

Everything the CrazyGames and Poki forms ask for, drawn in the game's own
visual system rather than alongside it.

| File | Size | What it's for |
|---|---|---|
| `Main.dc.html` | 1280×720 | Portal cover / key art |
| `OGCard.dc.html` | 1200×630 | Social preview for the repo and Pages link |
| `Icon.dc.html` | 512×512 | App icon and favicon source |
| `IconSizes.dc.html` | 820×548 | The icon at 128/64/32/16 on dark and light tab chrome |
| `Screen.dc.html` | 540×960 | Screenshot — mid-climb |
| `ScreenOpen.dc.html` | 540×960 | Screenshot — the opening, `HOLD` |
| `ScreenPressure.dc.html` | 540×960 | Screenshot — the collapse closing in |

## The screenshots are real frames

They are not drawings of the game. `tools/capture.mjs` plays a headless run
with `test/pilot.js` on seed 20250826 and dumps the exact state at the moments
worth showing; `tools/scene-svg.mjs` renders those states to SVG using the same
constants and draw order as `src/render.js`, and the HUD is rebuilt from
`index.html`'s own values. `ScreenPressure` is the frame one tick before death —
still tethered, nine pixels clear of the collapse.

Because the port is mechanical, it can be checked against the source it came
from: render a captured scene through the real `src/render.js` onto a canvas and
compare. That is how the collapse band was caught rendering a screenful
off-position.

## Regenerating

```bash
cd design/tools
node capture.mjs 20250826   # replay the run, refresh scenes.json
node build.mjs              # rewrite every artboard and canvas.json
```

Zero dependencies, same as the rest of the repo.

## Notes

- **Type is the game's own system stack** (`ui-rounded`, `SF Pro Rounded`, …).
  That is deliberate: PNG export can't embed a webfont, so anything set in a
  downloaded face would export in a fallback. It also means the art matches the
  game, which uses system fonts so it loads instantly. Exports will pick up
  whatever rounded face the exporting machine has.
- **The OG card carries no URL.** GitHub Pages isn't set up yet; there is no
  live link to print. Add one once it is.
