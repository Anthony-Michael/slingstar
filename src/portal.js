// Portal integration shim.
//
// Poki and CrazyGames both require the game to report when gameplay starts and
// stops, and to request ad breaks at natural pauses — that reporting is what
// they pay on. Their SDKs are loaded by the portal itself at publish time, so
// this file talks to whichever one is present and does nothing at all when the
// game is running on its own. That keeps the core zero-dependency and means the
// same build works locally, on itch, and on either portal.
//
// To publish:
//   Poki         — add their SDK script tag; PokiSDK appears on window.
//   CrazyGames   — add their SDK script tag; window.CrazySDK appears.
// No other change is needed.

const poki = () => (typeof window !== 'undefined' ? window.PokiSDK : null)
const crazy = () => (typeof window !== 'undefined' ? window.CrazySDK : null)

let inGameplay = false

/** Called once at boot. Resolves when the portal is ready to show the game. */
export async function initPortal() {
  const p = poki()
  if (p && typeof p.init === 'function') {
    try {
      await p.init()
      p.gameLoadingFinished?.()
      return
    } catch {
      // Portal SDK unavailable or blocked — play on regardless.
    }
  }
  crazy()?.init?.()
}

/** A run has begun. Portals use this to suppress ads during play. */
export function gameplayStart() {
  if (inGameplay) return
  inGameplay = true
  poki()?.gameplayStart?.()
  crazy()?.game?.gameplayStart?.()
}

/** A run has ended. */
export function gameplayStop() {
  if (!inGameplay) return
  inGameplay = false
  poki()?.gameplayStop?.()
  crazy()?.game?.gameplayStop?.()
}

/**
 * Ask for an ad break, then continue whatever happens. Gameplay is always
 * stopped first and restarted after, which is what both portals require — and
 * the callback must still run when there's no ad, or the game would hang on a
 * black screen waiting for a break that never comes.
 */
export function commercialBreak(resume) {
  const p = poki()
  if (p && typeof p.commercialBreak === 'function') {
    gameplayStop()
    p.commercialBreak().then(resume, resume)
    return
  }

  const c = crazy()
  if (c && c.ad && typeof c.ad.requestAd === 'function') {
    gameplayStop()
    let done = false
    const once = () => {
      if (!done) {
        done = true
        resume()
      }
    }
    try {
      c.ad.requestAd('midgame', { adFinished: once, adError: once })
    } catch {
      once()
    }
    return
  }

  resume()
}
