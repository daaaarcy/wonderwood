import { assetUrl } from '../../game/assets'
import { itemById } from '../../data/catalogue'
import { CHILDREN, EXPLORER_VIEWBOX } from '../../data/children'
import type { ChildId } from '../../domain/types'

interface Props {
  childId: ChildId
  hatItemId?: string | null
  /** Pixel width of the avatar (height follows the 200x240 proportions). */
  size: number
  className?: string
  /** Show just the head (stat bar / menus). */
  headOnly?: boolean
}

/**
 * Layered character render: explorer SVG with the equipped hat positioned at
 * the child's headAnchor — the same anchor math the Phaser scenes use, so the
 * shop preview matches the game world.
 */
export function CharacterAvatar({ childId, hatItemId, size, className, headOnly }: Props) {
  const def = CHILDREN[childId]
  const hat = hatItemId ? itemById(hatItemId) : undefined
  const anchor = hat?.anchor ?? { x: 0.5, y: 0.85 }
  const inner = (
    <div
      className={`avatar ${className ?? ''}`}
      style={{
        width: headOnly ? size * 1.5 : size,
        aspectRatio: `${EXPLORER_VIEWBOX.width} / ${EXPLORER_VIEWBOX.height}`,
      }}
    >
      <img
        className="avatar-body"
        src={assetUrl(def.explorerKey)}
        alt={def.name}
        draggable={false}
      />
      {hat && hat.slot === 'hat' && (
        <img
          className="avatar-hat"
          src={assetUrl(hat.assetKey)}
          alt=""
          draggable={false}
          style={{
            left: `${(def.headAnchor.x / EXPLORER_VIEWBOX.width) * 100}%`,
            top: `${(def.headAnchor.y / EXPLORER_VIEWBOX.height) * 100}%`,
            transform: `translate(-${anchor.x * 100}%, -${anchor.y * 100}%)`,
          }}
        />
      )}
    </div>
  )
  if (!headOnly) return inner
  return (
    <div className="avatar-crop" style={{ width: size, height: size }}>
      {inner}
    </div>
  )
}
