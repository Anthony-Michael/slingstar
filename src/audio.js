// Procedural sound. Synthesised on the fly so there are no audio files to
// download — the whole game stays tiny, and nothing blocks the first play.

let ctx = null
let muted = false

/** Browsers only allow audio after a gesture, so this is called on first press. */
function ensureContext() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone({ freq, to, duration, type = 'sine', gain = 0.18, sweep = 0 }) {
  const ac = ensureContext()
  if (!ac || muted) return
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, ac.currentTime + duration)
  amp.gain.setValueAtTime(gain, ac.currentTime)
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration)
  osc.connect(amp).connect(ac.destination)
  if (sweep) osc.detune.setValueAtTime(sweep, ac.currentTime)
  osc.start()
  osc.stop(ac.currentTime + duration + 0.02)
}

/** Short filtered noise burst — the "whoosh" of being flung. */
function noise({ duration = 0.22, gain = 0.16, from = 900, to = 220 }) {
  const ac = ensureContext()
  if (!ac || muted) return
  const frames = Math.floor(ac.sampleRate * duration)
  const buffer = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)

  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(from, ac.currentTime)
  filter.frequency.exponentialRampToValueAtTime(to, ac.currentTime + duration)
  const amp = ac.createGain()
  amp.gain.setValueAtTime(gain, ac.currentTime)
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration)
  src.connect(filter).connect(amp).connect(ac.destination)
  src.start()
}

export const sfx = {
  unlock: () => ensureContext(),
  grab: () => tone({ freq: 420, to: 700, duration: 0.1, type: 'triangle', gain: 0.13 }),
  /** Pitch rises with how hard you launched, so the sound rewards a full wind-up. */
  fling: wind => {
    noise({ duration: 0.2 + wind * 0.14, gain: 0.1 + wind * 0.1, from: 700 + wind * 1400, to: 260 })
    tone({ freq: 300 + wind * 420, to: 140, duration: 0.22, type: 'sawtooth', gain: 0.07 })
  },
  burnout: () => tone({ freq: 260, to: 90, duration: 0.3, type: 'square', gain: 0.07 }),
  milestone: () => tone({ freq: 880, to: 1320, duration: 0.14, type: 'sine', gain: 0.1 }),
  death: () => {
    tone({ freq: 180, to: 48, duration: 0.7, type: 'sawtooth', gain: 0.2 })
    noise({ duration: 0.5, gain: 0.14, from: 400, to: 90 })
  },
}

export function toggleMute() {
  muted = !muted
  return muted
}

export function isMuted() {
  return muted
}
