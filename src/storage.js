// Best score persistence. Wrapped in try/catch throughout — portal pages embed
// games in sandboxed iframes where touching localStorage can throw outright,
// and a missing high score must never stop the game from running.

const KEY = 'slingstar.best'

export function loadBest() {
  try {
    const raw = window.localStorage.getItem(KEY)
    const value = Number.parseInt(raw ?? '0', 10)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

export function saveBest(height) {
  try {
    window.localStorage.setItem(KEY, String(Math.floor(height)))
  } catch {
    // Sandboxed or storage disabled — the run still counts, it just won't persist.
  }
}
