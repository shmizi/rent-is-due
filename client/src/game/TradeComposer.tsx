import { useState } from 'react';
import type { Bundle } from '../../../shared/src/types.ts';
import { money } from '../lib/format.ts';
import { mapFor, memberLook, ownedBy, setHasBuildings } from '../lib/game.ts';
import { Button, Modal, Token } from '../ui/kit.tsx';
import { useGame } from './useGame.ts';

export interface TradeDraft {
  to: string;
  give: Bundle;
  get: Bundle;
  counterOf?: number;
}

const EMPTY: Bundle = { properties: [], cash: 0, jailCards: 0 };

export function TradeComposer({ draft, onClose }: { draft: TradeDraft | null; onClose: () => void }) {
  const { game, room, me, connection } = useGame();
  const others = game.players.filter((p) => p.status === 'active' && p.id !== me?.id);
  const [to, setTo] = useState(draft?.to ?? others[0]?.id ?? '');
  const [give, setGive] = useState<Bundle>(draft?.give ?? EMPTY);
  const [get, setGet] = useState<Bundle>(draft?.get ?? EMPTY);
  if (!me) return null;

  const them = game.players.find((p) => p.id === to);
  const map = mapFor(game);
  const tradeable = (owner: string) => ownedBy(game, owner).filter((i) => !setHasBuildings(game, i));

  const toggle = (bundle: Bundle, set: (b: Bundle) => void, index: number) =>
    set({ ...bundle, properties: bundle.properties.includes(index) ? bundle.properties.filter((i) => i !== index) : [...bundle.properties, index] });

  const empty = give.properties.length + get.properties.length === 0 && give.cash + get.cash + give.jailCards + get.jailCards === 0;

  function send() {
    if (draft?.counterOf !== undefined) connection.act({ type: 'counterTrade', trade: draft.counterOf, give, get });
    else connection.act({ type: 'proposeTrade', to, give, get });
    onClose();
  }

  function side(title: string, owner: string, cashMax: number, cards: number, bundle: Bundle, set: (b: Bundle) => void) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted">{title}</h3>
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl border border-line p-2">
          {tradeable(owner).length === 0 && <p className="p-1 text-xs text-muted">No properties that can be traded.</p>}
          {tradeable(owner).map((i) => {
            const space = map.spaces[i];
            const color = space.kind === 'street' ? map.groups[space.group].color : '#5B6190';
            return (
              <label key={i} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-raised">
                <input type="checkbox" checked={bundle.properties.includes(i)} onChange={() => toggle(bundle, set, i)} className="h-4 w-4 accent-[#3DDC97]" />
                <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
                <span className="flex-1 text-[13px]">{space.name}</span>
                {game.props[i]?.mortgaged && <span className="text-[11px] text-amber">mortgaged</span>}
              </label>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <span className="w-14 text-muted">Cash</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={cashMax}
            value={bundle.cash || ''}
            placeholder="0"
            onChange={(e) => set({ ...bundle, cash: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-ink px-2"
          />
        </label>
        <span className="text-[11px] text-muted">Has {money(cashMax)}</span>
        {cards > 0 && game.settings.jailCardsTradable && (
          <label className="flex items-center gap-2 text-[13px]">
            <span className="w-14 text-muted">Cards</span>
            <input type="number" min={0} max={cards} value={bundle.jailCards} onChange={(e) => set({ ...bundle, jailCards: Math.min(cards, Math.max(0, Math.round(Number(e.target.value) || 0))) })} className="h-10 w-20 rounded-lg border border-line bg-ink px-2" />
          </label>
        )}
      </div>
    );
  }

  return (
    <Modal title={draft?.counterOf !== undefined ? 'Counter-offer' : 'New trade offer'} onClose={onClose} wide>
      {draft?.counterOf === undefined && (
        <div className="mb-4 flex flex-wrap gap-2">
          {others.map((p) => {
            const look = memberLook(room.members, p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={to === p.id}
                onClick={() => {
                  setTo(p.id);
                  setGet(EMPTY);
                }}
                className={`flex h-11 items-center gap-2 rounded-full border-2 px-3 ${to === p.id ? 'border-mint bg-raised' : 'border-line'}`}
              >
                <Token color={look.color} shape={look.shape} size={22} />
                <span className="text-sm font-semibold">{p.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {them ? (
        <div className="flex flex-col gap-4 sm:flex-row">
          {side('You give', me.id, me.cash, me.jailCards.length, give, setGive)}
          {side(`${them.name} gives`, them.id, them.cash, them.jailCards.length, get, setGet)}
        </div>
      ) : (
        <p className="text-muted">There’s nobody to trade with.</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button tone="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button tone="primary" onClick={send} disabled={!them || empty}>
          Send offer
        </Button>
      </div>
    </Modal>
  );
}
