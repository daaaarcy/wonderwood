import { useState } from 'react'
import type { ChildId } from '../../domain/types'
import {
  EYE_STYLES,
  GLASSES_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_STYLES,
  OUTFIT_COLORS,
  SKIN_TONES,
  type AvatarLook,
} from '../../domain/avatar'
import { explorerDataUrl } from '../../game/avatarSvg'
import { itemById } from '../../data/catalogue'
import { CHILDREN, EXPLORER_VIEWBOX } from '../../data/children'
import { assetUrl } from '../../game/assets'
import { useGameState, useRepository } from '../../storage/hooks'

type Category =
  | { id: 'skin' | 'hairColor' | 'shirt' | 'scarf'; label: string; kind: 'color'; options: string[] }
  | {
      id: 'hair' | 'eyes' | 'mouth' | 'glasses'
      label: string
      kind: 'style'
      options: string[]
    }

const CATEGORIES: Category[] = [
  { id: 'skin', label: 'Skin', kind: 'color', options: SKIN_TONES },
  { id: 'hair', label: 'Hair', kind: 'style', options: [...HAIR_STYLES] },
  { id: 'hairColor', label: 'Hair colour', kind: 'color', options: HAIR_COLORS },
  { id: 'eyes', label: 'Eyes', kind: 'style', options: [...EYE_STYLES] },
  { id: 'mouth', label: 'Mouth', kind: 'style', options: [...MOUTH_STYLES] },
  { id: 'glasses', label: 'Glasses', kind: 'style', options: [...GLASSES_STYLES] },
  { id: 'shirt', label: 'Shirt', kind: 'color', options: OUTFIT_COLORS },
  { id: 'scarf', label: 'Scarf', kind: 'color', options: OUTFIT_COLORS },
]

const STYLE_LABELS: Record<string, string> = {
  swoop: 'Swoopy',
  curly: 'Curly',
  buzz: 'Buzz',
  spiky: 'Spiky',
  bowl: 'Bowl',
  long: 'Long',
  bun: 'Bun',
  mohawk: 'Mohawk',
  round: 'Round',
  sparkle: 'Sparkly',
  happy: 'Happy',
  dot: 'Dotty',
  sleepy: 'Sleepy',
  open: 'Open',
  grin: 'Grin',
  smile: 'Smile',
  tongue: 'Silly',
  o: 'Wow',
  none: 'None',
  square: 'Square',
  shades: 'Shades',
}

/** Little face crop showing the draft look with one option applied. */
function FaceThumb({ look }: { look: AvatarLook }) {
  return (
    <span className="avatar-crop opt-thumb" aria-hidden="true">
      <span
        className="avatar"
        style={{ width: '150%', aspectRatio: `${EXPLORER_VIEWBOX.width} / ${EXPLORER_VIEWBOX.height}` }}
      >
        <img className="avatar-body" src={explorerDataUrl(look)} alt="" draggable={false} />
      </span>
    </span>
  )
}

function randomLook(): AvatarLook {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
  return {
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    eyes: pick(EYE_STYLES),
    mouth: pick(MOUTH_STYLES),
    glasses: pick(GLASSES_STYLES),
    shirt: pick(OUTFIT_COLORS),
    scarf: pick(OUTFIT_COLORS),
  }
}

/**
 * "Change my look" — free avatar builder (no coins, nothing competitive).
 * Same head geometry for every option, so hats still sit right.
 */
export function AvatarEditor({ childId, onDone }: { childId: ChildId; onDone: () => void }) {
  const state = useGameState()
  const repo = useRepository()
  const child = state.children[childId]
  const [draft, setDraft] = useState<AvatarLook>({ ...child.look })
  const [cat, setCat] = useState<Category['id']>('skin')

  const category = CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[0]
  const hat = child.equipped.hat ? itemById(child.equipped.hat) : undefined
  const hatAnchor = hat?.anchor ?? { x: 0.5, y: 0.85 }

  const choose = (value: string) => setDraft((d) => ({ ...d, [category.id]: value }))

  const save = () => {
    void repo.dispatch({ type: 'setLook', childId, look: draft })
    onDone()
  }

  return (
    <div className="screen avatar-editor" data-testid="avatar-editor">
      <h2 className="screen-title">Make {CHILDREN[childId].name} your way</h2>

      <div className="look-preview">
        <div
          className="avatar look-preview-avatar"
          style={{ aspectRatio: `${EXPLORER_VIEWBOX.width} / ${EXPLORER_VIEWBOX.height}` }}
        >
          <img
            className="avatar-body"
            src={explorerDataUrl(draft)}
            alt={`${CHILDREN[childId].name} preview`}
            draggable={false}
          />
          {hat && hat.slot === 'hat' && (
            <img
              className="avatar-hat"
              src={assetUrl(hat.assetKey)}
              alt=""
              draggable={false}
              style={{
                left: `${(CHILDREN[childId].headAnchor.x / EXPLORER_VIEWBOX.width) * 100}%`,
                top: `${(CHILDREN[childId].headAnchor.y / EXPLORER_VIEWBOX.height) * 100}%`,
                transform: `translate(-${hatAnchor.x * 100}%, -${hatAnchor.y * 100}%)`,
              }}
            />
          )}
        </div>
      </div>

      <div className="look-cats" role="tablist" aria-label="Choose a part to change">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            className={`look-cat ${cat === c.id ? 'look-cat-active' : ''}`}
            onClick={() => setCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="look-options" role="tabpanel" aria-label={category.label}>
        {category.options.map((opt) => {
          const selected = draft[category.id] === opt
          const label = category.kind === 'color' ? opt : (STYLE_LABELS[opt] ?? opt)
          return (
            <button
              key={opt}
              className={`look-opt ${selected ? 'look-opt-active' : ''}`}
              onClick={() => choose(opt)}
              aria-label={`${category.label}: ${label}`}
              aria-pressed={selected}
            >
              {category.kind === 'color' ? (
                <span className="look-swatch" style={{ background: opt }} aria-hidden="true" />
              ) : (
                <>
                  <FaceThumb look={{ ...draft, [category.id]: opt } as AvatarLook} />
                  <span className="look-opt-label">{label}</span>
                </>
              )}
            </button>
          )
        })}
      </div>

      <div className="look-actions">
        <button
          className="btn btn-big btn-yes look-save"
          onClick={save}
          data-testid="save-look"
        >
          Save
        </button>
        <div className="look-actions-secondary">
          <button className="btn btn-neutral" onClick={() => setDraft(randomLook())}>
            Surprise me
          </button>
          <button className="btn btn-ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
