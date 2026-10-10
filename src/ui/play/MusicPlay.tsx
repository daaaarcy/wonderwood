import { useRef, useState } from 'react'
import { assetUrl } from '../../game/assets'
import { MusicNoteIcon } from '../components/FlatIcons'

const NOTES = [
  { name: 'C', freq: 261.63, color: '#e0483e' },
  { name: 'D', freq: 293.66, color: '#ef8f1a' },
  { name: 'E', freq: 329.63, color: '#f2c40f' },
  { name: 'F', freq: 349.23, color: '#58b368' },
  { name: 'G', freq: 392.0, color: '#4a9ede' },
  { name: 'A', freq: 440.0, color: '#9a6fe0' },
  { name: 'B', freq: 493.88, color: '#ff7b9c' },
  { name: 'C2', freq: 523.25, color: '#1cb0f6' },
]

/** A cheerful little tune (note indices in order). */
const TUNE: number[] = [0, 2, 4, 0, 4, 5, 4, 2, 0, 4, 7, 4, 5, 4, 2, 0]

export function MusicPlay({ soundOn }: { soundOn: boolean }) {
  const ctxRef = useRef<AudioContext | null>(null)
  const [show, setShow] = useState(false)
  const [hitBar, setHitBar] = useState<number | null>(null)
  const [notes, setNotes] = useState<number>(0)

  const audio = () => {
    ctxRef.current ??= new AudioContext()
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume()
    return ctxRef.current
  }

  const strike = (i: number, when = 0) => {
    setHitBar(i)
    setTimeout(() => setHitBar(null), 200)
    setNotes((n) => n + 1)
    if (!soundOn) return
    try {
      const ctx = audio()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = NOTES[i]?.freq ?? 440
      const t = ctx.currentTime + when
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.32, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.95)
    } catch {
      // no audio — visuals still play
    }
  }

  const startShow = () => {
    if (show) return
    setShow(true)
    TUNE.forEach((n, i) => setTimeout(() => strike(n), i * 340))
    setTimeout(() => setShow(false), TUNE.length * 340 + 800)
  }

  return (
    <div className="music-play">
      <div className={`music-stage ${show ? 'showing' : ''}`} data-testid="music-stage">
        {/* stage curtains */}
        <div className="curtain curtain-left" aria-hidden="true" />
        <div className="curtain curtain-right" aria-hidden="true" />
        <div className="curtain-valance" aria-hidden="true" />
        <div className="stage-floor" aria-hidden="true" />
        <div className="spotlight spot-left" aria-hidden="true" />
        <div className="spotlight spot-right" aria-hidden="true" />
        <img src={assetUrl('explorer-theodore')} alt="Theodore" className="stage-explorer bop-left" />
        <img src={assetUrl('explorer-leonard')} alt="Leonard" className="stage-explorer bop-right" />
        {Array.from({ length: Math.min(notes, 6) }).map((_, i) => (
          <span key={`${notes}-${i}`} className="float-note" style={{ left: `${22 + i * 11}%` }}>
            <MusicNoteIcon size={26} />
          </span>
        ))}
      </div>
      {!soundOn && <p className="muted">Sound is off — watch the show anyway!</p>}
      {/* xylophone on a wooden frame */}
      <div className="xylo-frame" data-testid="xylo">
        <div className="xylo-rail rail-top" />
        <div className="xylo-bars">
          {NOTES.map((n, i) => (
            <button
              key={n.name + i}
              className={`xylo-bar ${hitBar === i ? 'struck' : ''}`}
              style={{ background: n.color, height: `${140 - i * 10}px` }}
              onClick={() => strike(i)}
              aria-label={`Note ${n.name}`}
            >
              <span className="xylo-peg" />
              <span className="xylo-peg peg-bottom" />
            </button>
          ))}
        </div>
        <div className="xylo-rail rail-bottom" />
      </div>
      <button className="btn btn-yes btn-big" onClick={startShow} disabled={show}>
        {show ? 'Show time!' : 'Start the show'}
      </button>
    </div>
  )
}
