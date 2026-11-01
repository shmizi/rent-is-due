import { motion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import type { MemberView } from '../../../shared/src/protocol.ts';
import type { GameView } from '../../../shared/src/view.ts';
import { money } from '../lib/format.ts';
import { inkFor, mapFor, memberLook, sidePosition } from '../lib/game.ts';
import { Icon, SET_ICONS, SPACE_ICONS, TOKEN_PATHS } from '../ui/icons.tsx';

const CORNER_SUB: Record<string, string> = {
  start: 'Collect salary',
  jail: 'Just visiting',
  free: 'Free stop',
  goToJail: 'Go to Lockup'
};

function spaceIcon(kind: string, name: string): string | null {
  if (kind === 'utility') return /power/i.test(name) ? SPACE_ICONS.power : SPACE_ICONS.water;
  if (kind === 'card') return /dispatch/i.test(name) ? SPACE_ICONS.dispatch : SPACE_ICONS.wildcard;
  if (kind === 'transit') return SPACE_ICONS.transit;
  if (kind === 'tax') return SPACE_ICONS.tax;
  return SPACE_ICONS[kind] ?? null;
}

export function Board({
  game,
  members,
  selected,
  onSelect,
  center,
  focusedPlayer,
  you
}: {
  game: GameView;
  members: MemberView[];
  selected: number | null;
  onSelect: (index: number) => void;
  center: ReactNode;
  focusedPlayer?: string | null;
  you?: string;
}) {
  const map = mapFor(game);
  const n = map.spaces.length;
  const k = n / 4;
  const tracks = `1.6fr repeat(${k - 1}, 1fr) 1.6fr`;

  const tokensAt = new Map<number, typeof game.players>();
  for (const p of game.players) {
    if (p.status !== 'active') continue;
    tokensAt.set(p.position, [...(tokensAt.get(p.position) ?? []), p]);
  }

  return (
    <div className="board" style={{ gridTemplateColumns: tracks, gridTemplateRows: tracks, '--board-tracks': tracks } as CSSProperties}>
      <div className="board-center relative flex flex-col items-center justify-center" style={{ gridRow: `2 / ${k + 1}`, gridColumn: `2 / ${k + 1}` }}>
        {center}
      </div>

      {map.spaces.map((space, i) => {
        const pos = sidePosition(i, n);
        const prop = game.props[i];
        const owner = prop?.owner ? memberLook(members, prop.owner) : null;
        const group = space.kind === 'street' ? map.groups[space.group] : null;
        const rings = [owner ? `inset 0 0 0 3px ${owner.color}` : '', selected === i ? '0 0 0 3px #3DDC97' : ''].filter(Boolean).join(', ');
        const icon = spaceIcon(space.kind, space.name);
        const price = prop?.mortgaged
          ? 'Mortgaged'
          : 'price' in space
            ? money(space.price)
            : space.kind === 'tax'
              ? space.tax.type === 'income'
                ? game.settings.incomeTax.mode === 'percent'
                  ? `${game.settings.incomeTax.percent}% cash`
                  : money(game.settings.incomeTax.amount)
                : money(space.tax.amount)
              : null;
        const tokens = tokensAt.get(i) ?? [];
        const currentHere = tokens.some((p) => p.id === game.turn.player);
        const focusHere = tokens.some((p) => p.id === focusedPlayer);

        return (
          <button
            key={i}
            type="button"
            className="tile"
            data-space={i}
            data-current={currentHere}
            data-located={focusHere}
            data-side={pos.side}
            data-mortgaged={prop?.mortgaged ? 'true' : 'false'}
            aria-label={`${space.name}${'price' in space ? `, ${money(space.price)}` : ''}${tokens.length ? `. Players here: ${tokens.map((p) => p.name).join(', ')}` : ''}`}
            aria-pressed={selected === i}
            onClick={() => onSelect(i)}
            style={{ gridRow: pos.row, gridColumn: pos.col, boxShadow: rings || undefined, zIndex: selected === i ? 2 : undefined }}
          >
            {pos.side === 'corner' ? (
              <span className="tile-inner items-center justify-center gap-1 p-1">
                {icon && <Icon path={icon} className="corner-icon text-board-sub" />}
                <span className="corner-label">{space.name}</span>
                <span className="corner-sub">{CORNER_SUB[space.kind]}</span>
              </span>
            ) : (
              <span className="tile-inner">
                <span className="tile-band" style={{ background: group?.color ?? 'transparent' }}>
                  {group && <Icon path={SET_ICONS[group.icon] ?? SET_ICONS.circle} stroke={inkFor(group.color)} width={3} />}
                  <span className="flex-1" />
                  {(prop?.houses ?? 0) === 5 ? (
                    <span className="h-[45%] w-[34%] rounded-[1px] bg-gold shadow-[0_0_0_1px_rgba(20,16,10,.5)]" />
                  ) : (
                    Array.from({ length: prop?.houses ?? 0 }, (_, h) => <span key={h} className="aspect-square h-[45%] rounded-[1px] bg-white shadow-[0_0_0_1px_rgba(20,16,10,.5)]" />)
                  )}
                </span>
                {!group && icon && (
                  <span className="tile-icon">
                    <Icon path={icon} />
                  </span>
                )}
                <span className="tile-name">{space.name}</span>
                {price && (
                  <span className="tile-price">
                    <span>{price}</span>
                  </span>
                )}
              </span>
            )}

          </button>
        );
      })}

      <div className="board-pieces" aria-hidden="true">
        {[...tokensAt.entries()].map(([index, players]) => {
          const pos = sidePosition(index, n);
          // Keep the located player and the turn owner visible in a crowded space.
          const priority = (id: string) => id === focusedPlayer ? 3 : id === game.turn.player ? 2 : id === you ? 1 : 0;
          const visible = [...players].sort((a, b) => priority(b.id) - priority(a.id)).slice(0, 3).reverse();
          return (
            <div key={index} className="piece-cell" style={{ gridRow: pos.row, gridColumn: pos.col }}>
              <div className="piece-stack">
                {visible.map((p) => {
                  const look = memberLook(members, p.id);
                  const current = p.id === game.turn.player;
                  const located = p.id === focusedPlayer;
                  return (
                    <motion.span key={p.id} layoutId={`token-${p.id}`} transition={{ type: 'spring', stiffness: 240, damping: 25 }}
                      className="board-piece" data-current={current} data-located={located} data-player={p.id}
                      style={{ '--piece-color': look.color, zIndex: located ? 5 : current ? 4 : 1 } as CSSProperties}>
                      {(located || (current && !players.some((player) => player.id === focusedPlayer))) && <span className="piece-flag">{p.id === you ? 'YOU' : current ? 'TURN' : p.name}</span>}
                      <svg viewBox="0 0 24 24"><path d={TOKEN_PATHS[look.shape] ?? TOKEN_PATHS.circle} fill={look.color} stroke="#fff" strokeWidth="2.5" /></svg>
                      <span className="piece-initial" style={{ color: inkFor(look.color) }}>{p.name.charAt(0).toUpperCase()}</span>
                    </motion.span>
                  );
                })}
                {players.length > visible.length && <span className="piece-count">+{players.length - visible.length}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
