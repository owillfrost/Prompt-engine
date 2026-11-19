// Sintetizador Web Audio API leve para feedback tátil de descoberta (sem assets externos).

let sharedAudioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctor()
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {
      // Ignora bloqueio de autoplay se ocorrer antes de gesto
    })
  }
  return sharedAudioCtx
}

/**
 * Click mecânico suave + ressonância quente (~90ms) ao revelar um gap virgem (O=0).
 */
export function playGapRevealSound(enabled: boolean): void {
  if (!enabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // Click curto tátil
    const clickOsc = ctx.createOscillator()
    const clickGain = ctx.createGain()
    clickOsc.type = 'triangle'
    clickOsc.frequency.setValueAtTime(620, now)
    clickOsc.frequency.exponentialRampToValueAtTime(240, now + 0.035)
    clickGain.gain.setValueAtTime(0.05, now)
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)
    clickOsc.connect(clickGain)
    clickGain.connect(ctx.destination)
    clickOsc.start(now)
    clickOsc.stop(now + 0.045)

    // Sobretom quente discreto
    const warmOsc = ctx.createOscillator()
    const warmGain = ctx.createGain()
    warmOsc.type = 'sine'
    warmOsc.frequency.setValueAtTime(440, now + 0.02)
    warmOsc.frequency.exponentialRampToValueAtTime(660, now + 0.09)
    warmGain.gain.setValueAtTime(0.001, now + 0.02)
    warmGain.gain.linearRampToValueAtTime(0.035, now + 0.035)
    warmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095)
    warmOsc.connect(warmGain)
    warmGain.connect(ctx.destination)
    warmOsc.start(now + 0.02)
    warmOsc.stop(now + 0.1)
  } catch {
    // No-op seguro se Web Audio falhar
  }
}

/**
 * Chime harmônico discreto de duas notas (~160ms, ganho baixo 0.04) para Tier S / Território Virgem.
 */
export function playTierSChime(enabled: boolean): void {
  if (!enabled) return
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime
    const notes = [587.33, 880] // D5 -> A5 (quinta justa limpa)

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.055
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, start)

      gain.gain.setValueAtTime(0.001, start)
      gain.gain.linearRampToValueAtTime(0.04, start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.115)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.12)
    })
  } catch {
    // No-op seguro
  }
}
