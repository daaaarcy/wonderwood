/**
 * Short synthesized promotion fanfare (~1.5s ascending, WebAudio, no files).
 * Must never throw — AudioContext may be missing or autoplay-blocked.
 */
export function playFanfare(enabled: boolean): void {
  if (!enabled) return
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined)
    }
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    const t0 = ctx.currentTime + 0.05
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = i === notes.length - 1 ? 'triangle' : 'sine'
      osc.frequency.value = freq
      const start = t0 + i * 0.18
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (i === notes.length - 1 ? 0.7 : 0.28))
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.75)
    })
    setTimeout(() => void ctx.close().catch(() => undefined), 2500)
  } catch {
    // Audio unavailable — celebration still works silently.
  }
}
