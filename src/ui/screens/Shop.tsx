import { useState } from 'react'
import type { ChildId } from '../../domain/types'
import { CHILDREN } from '../../data/children'
import { CATALOGUE, itemById, type ShopItem } from '../../data/catalogue'
import { assetUrl } from '../../game/assets'
import { useGameState, useRepository } from '../../storage/hooks'
import { CharacterAvatar } from '../components/CharacterAvatar'

export function Shop({ childId, onBack }: { childId: ChildId; onBack: () => void }) {
  const state = useGameState()
  const repo = useRepository()
  const child = state.children[childId]
  const def = CHILDREN[childId]
  const [selectedId, setSelectedId] = useState<string>(
    CATALOGUE.find((i) => i.price > 0)?.id ?? CATALOGUE[0].id,
  )
  const selected: ShopItem | undefined = itemById(selectedId)
  const owned = selected ? child.inventory.includes(selected.id) : false
  const equipped = selected ? child.equipped[selected.slot] === selected.id : false
  const needed = selected ? Math.max(0, selected.price - child.coins) : 0

  return (
    <div className="screen shop-screen">
      <header className="home-header">
        <div className="header-id">
          <CharacterAvatar childId={childId} hatItemId={child.equipped.hat} size={56} />
          <span className="header-name">{def.name}&rsquo;s shop</span>
        </div>
        <div className="coin-purse">
          <img src={assetUrl('coin')} alt="" />
          <span data-testid="coin-count">{child.coins}</span>
        </div>
        <nav className="header-nav">
          <button className="btn btn-small btn-ghost" onClick={onBack}>
            Back
          </button>
        </nav>
      </header>

      <div className="shop-body">
        <div className="shop-preview panel">
          {selected?.slot === 'hat' ? (
            <CharacterAvatar
              childId={childId}
              hatItemId={selected.id}
              size={190}
              className="shop-avatar"
            />
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
                  disabled={needed > 0}
                  onClick={() =>
                    repo.dispatch({
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
                  onClick={() => repo.dispatch({ type: 'setWish', childId, itemId: selected.id })}
                >
                  {child.wishItem === selected.id ? 'Saving for this!' : 'Save for this'}
                </button>
              </>
            )}
            {owned && selected?.slot === 'hat' && (
              <button
                className="btn btn-big"
                onClick={() =>
                  repo.dispatch({
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
            {owned && <span className="tag tag-owned">Owned</span>}
          </div>
        </div>

        <ul className="shop-list">
          {CATALOGUE.map((item) => {
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
      </div>
    </div>
  )
}
