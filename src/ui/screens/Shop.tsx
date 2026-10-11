import { useState } from 'react'
import type { ChildId, FurnitureSpot, ItemSpot } from '../../domain/types'
import { spotsFor } from '../../domain/commands'
import { CHILDREN } from '../../data/children'
import { CATALOGUE, FURNITURE_GROUPS, itemById, type ShopItem } from '../../data/catalogue'
import { assetUrl } from '../../game/assets'
import { useGameState, useRepository, useRepoStatus } from '../../storage/hooks'
import { CharacterAvatar } from '../components/CharacterAvatar'

type ShopTab = 'wear' | 'play' | 'room'

const TABS: { id: ShopTab; label: string }[] = [
  { id: 'wear', label: 'Wear' },
  { id: 'play', label: 'Play' },
  { id: 'room', label: 'My room' },
]

const TAB_SLOTS: Record<ShopTab, ShopItem['slot'][]> = {
  wear: ['hat'],
  play: ['toy'],
  room: ['furniture'],
}

/** Where the item sits inside the little room-corner preview. */
const PREVIEW_POS: Record<ItemSpot, { left: string; top: string; width: string }> = {
  bed: { left: '4%', top: '48%', width: '56%' },
  rug: { left: '28%', top: '66%', width: '56%' },
  chair: { left: '52%', top: '55%', width: '26%' },
  desk: { left: '46%', top: '42%', width: '50%' },
  computer: { left: '56%', top: '30%', width: '24%' },
  shelf: { left: '70%', top: '26%', width: '24%' },
  lamp: { left: '34%', top: '26%', width: '18%' },
  decor: { left: '36%', top: '10%', width: '30%' },
}

/** The shop's little room-corner preview with the furniture placed in it. */
function FurniturePreview({ item }: { item: ShopItem }) {
  const pos = PREVIEW_POS[item.spot ?? 'decor']
  return (
    <div className="room-preview" data-testid="room-preview">
      <div className="room-preview-wall" />
      <div className="room-preview-floor" />
      <div className="room-preview-baseboard" />
      <img
        src={assetUrl(item.assetKey)}
        alt={item.name}
        className="room-preview-item"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
      />
    </div>
  )
}

export function Shop({ childId }: { childId: ChildId }) {
  const state = useGameState()
  const repo = useRepository()
  const offline = useRepoStatus() === 'offline'
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const [tab, setTab] = useState<ShopTab>('wear')
  const shopItems = CATALOGUE.filter((i) => !i.hidden)
  const visibleItems =
    tab === 'room' ? shopItems.filter((i) => TAB_SLOTS.room.includes(i.slot)) : shopItems.filter((i) => TAB_SLOTS[tab].includes(i.slot))
  const [selectedId, setSelectedId] = useState<string>(
    shopItems.find((i) => i.price > 0)?.id ?? shopItems[0].id,
  )
  const selected: ShopItem | undefined = itemById(selectedId)
  const owned = selected ? child.inventory.includes(selected.id) : false
  const equipped =
    selected && (selected.slot === 'hat' || selected.slot === 'toy')
      ? child.equipped[selected.slot] === selected.id
      : false
  const needed = selected ? Math.max(0, selected.price - child.coins) : 0

  /** Which room spot currently holds this furniture item (if placed). */
  const placedSpotOf = (itemId: string): FurnitureSpot | undefined =>
    (Object.keys(child.placed) as FurnitureSpot[]).find((s) => child.placed[s] === itemId)

  /** First compatible free spot for a furniture item (fallback: its own spot). */
  const placementSpotFor = (item: ShopItem): FurnitureSpot | undefined =>
    spotsFor(item.spot).find((s) => child.placed[s] == null) ?? spotsFor(item.spot)[0]

  const selectTab = (t: ShopTab) => {
    setTab(t)
    const first = shopItems.find((i) => TAB_SLOTS[t].includes(i.slot))
    if (first) setSelectedId(first.id)
  }

  const groups =
    tab === 'room'
      ? FURNITURE_GROUPS.map((g) => ({
          ...g,
          items: visibleItems.filter((i) => g.spots.includes(i.spot ?? ('' as ItemSpot))),
        })).filter((g) => g.items.length > 0)
      : [{ title: '', items: visibleItems }]

  return (
    <div className="screen shop-screen">
      <h2 className="screen-title">{def.name}&rsquo;s shop</h2>

      <div className="shop-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`shop-tab ${tab === t.id ? 'selected' : ''}`}
            data-testid={`tab-${t.id}`}
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="shop-body">
        <div className="shop-preview panel">
          {selected?.slot === 'hat' ? (
            <CharacterAvatar
              childId={childId}
              hatItemId={selected.id}
              size={190}
              className="shop-avatar"
            />
          ) : selected?.slot === 'furniture' ? (
            <FurniturePreview item={selected} />
          ) : (
            selected && (
              <img src={assetUrl(selected.assetKey)} alt={selected.name} className="shop-item-preview" />
            )
          )}
          <h3>{selected?.name}</h3>
          <p className="muted">{selected?.blurb}</p>
          <div className="shop-actions">
            {!owned && selected && (
              <>
                <button
                  className="btn btn-big btn-yes"
                  disabled={needed > 0 || offline}
                  onClick={() =>
                    void repo.dispatch({
                      type: 'purchase',
                      childId,
                      itemId: selected.id,
                      purchaseId: crypto.randomUUID(),
                    })
                  }
                >
                  {needed > 0 ? `Need ${needed} more coin${needed === 1 ? '' : 's'}` : `Buy for ${selected.price} coins`}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => void repo.dispatch({ type: 'setWish', childId, itemId: selected.id })}
                >
                  {child.wishItem === selected.id ? 'Saving for this!' : 'Save for this'}
                </button>
              </>
            )}
            {owned && selected?.slot === 'hat' && (
              <button
                className="btn btn-big"
                onClick={() =>
                  void repo.dispatch({
                    type: 'equip',
                    childId,
                    slot: 'hat',
                    itemId: equipped ? null : selected.id,
                  })
                }
              >
                {equipped ? 'Take it off' : 'Wear it'}
              </button>
            )}
            {owned && selected?.slot === 'toy' && (
              <span className="tag tag-done">Owned — playing in my room</span>
            )}
            {owned && selected?.slot === 'furniture' && (
              <>
                {placedSpotOf(selected.id) ? (
                  <>
                    <span className="tag tag-done">In my room</span>
                    <button
                      className="btn btn-ghost"
                      data-testid="take-out"
                      onClick={() => {
                        const spot = placedSpotOf(selected.id)
                        if (spot) void repo.dispatch({ type: 'placeItem', childId, spot, itemId: null })
                      }}
                    >
                      Take out
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-big btn-yes"
                    data-testid="place-it"
                    onClick={() => {
                      const spot = placementSpotFor(selected)
                      if (spot) void repo.dispatch({ type: 'placeItem', childId, spot, itemId: selected.id })
                    }}
                  >
                    Place it in my room
                  </button>
                )}
              </>
            )}
            {owned && <span className="tag tag-owned">Owned</span>}
          </div>
        </div>

        <ul className="shop-list">
          {groups.map((group) => (
            <li key={group.title || 'all'} className="shop-group">
              {group.title && <p className="shop-group-title">{group.title}</p>}
              <ul className="shop-list-inner">
                {group.items.map((item) => {
                  const isOwned = child.inventory.includes(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        className={`shop-card ${item.id === selectedId ? 'selected' : ''}`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <img src={assetUrl(item.assetKey)} alt="" className="shop-card-img" />
                        <span className="shop-card-name">{item.name}</span>
                        <span className="shop-card-price">
                          {isOwned ? (
                            'Owned'
                          ) : item.price === 0 ? (
                            'Free'
                          ) : (
                            <>
                              <img src={assetUrl('coin')} alt="" className="price-coin" /> {item.price}
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
