// One boolean is the entire control scheme: are you holding on or not.
// Pointer, touch and keyboard all feed the same flag.

export function createInput(target) {
  const state = { holding: false, pressedThisFrame: false }

  const press = () => {
    if (!state.holding) state.pressedThisFrame = true
    state.holding = true
  }
  const release = () => {
    state.holding = false
  }

  // Pointer events cover mouse, touch and pen in one path. touch-action is
  // disabled in CSS so a hold never turns into a page scroll on mobile.
  target.addEventListener('pointerdown', e => {
    e.preventDefault()
    press()
  })
  target.addEventListener('pointerup', release)
  target.addEventListener('pointercancel', release)
  target.addEventListener('pointerleave', release)

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
      e.preventDefault()
      press()
    }
  })
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') release()
  })

  // Letting go is the safe default whenever focus leaves — otherwise an
  // alt-tab mid-orbit leaves you stuck holding on.
  window.addEventListener('blur', release)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) release()
  })

  return {
    get holding() {
      return state.holding
    },
    /** True once per press. Used for menu taps without eating the hold. */
    consumePress() {
      const pressed = state.pressedThisFrame
      state.pressedThisFrame = false
      return pressed
    },
  }
}
