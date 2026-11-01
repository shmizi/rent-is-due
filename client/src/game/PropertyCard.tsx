import { mapFor, memberLook, setHasBuildings, unmortgageCost, mortgageValue } from '../lib/game.ts';
import { money } from '../lib/format.ts';
import { spaceInfo } from '../lib/spaces.ts';
import { Icon, SET_ICONS, SPACE_ICONS } from '../ui/icons.tsx';
import { Button } from '../ui/kit.tsx';
import { useGame } from './useGame.ts';

export function PropertyCard({ index, onTrade }: { index: number; onTrade: (index: number) => void }) {
  const { game, room, me, active, connection } = useGame();
  const info = spaceInfo(game, index);
  const prop = game.props[index];
  const space = mapFor(game).spaces[index];
  const mine = !!me && active && prop?.owner === me.id;
  const theirs = !!me && active && !!prop?.owner && prop.owner !== me.id;
  const iconPath = info.icon ? (SET_ICONS[info.icon] ?? (info.icon === 'utility' ? SPACE_ICONS.power : SPACE_ICONS[info.icon])) : null;
  const ownerColor = info.ownerId ? memberLook(room.members, info.ownerId).color : '#A3A9D1';
  const playing = game.status === 'playing';

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-2 px-4 py-2.5 text-[#1D1B2E]" style={{ background: info.color, color: info.color === '#3A4170' ? '#fff' : undefined }}>
        {iconPath && <Icon path={iconPath} size={14} width={3} />}
        <span className="text-xs font-bold">{info.kindLabel}</span>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[22px] font-semibold leading-tight">{info.name}</span>
          {info.price !== null && <span className="money text-lg font-semibold text-gold">{money(info.price)}</span>}
        </div>
        {info.status && (
          <span className="text-xs font-semibold" style={{ color: ownerColor }}>
            {info.status}
          </span>
        )}
        {info.description && <p className="text-sm text-soft">{info.description}</p>}
        {info.rows.length > 0 && (
          <dl className="flex flex-col">
            {info.rows.map((r) => (
              <div key={r.label} className={`flex justify-between border-b border-[#262c55] py-1 text-[13px] ${r.active ? 'font-semibold text-text' : ''}`}>
                <dt className={r.active ? 'text-mint' : 'text-[#b8bddf]'}>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {info.footer && <span className="text-xs text-muted">{info.footer}</span>}

        {mine && playing && prop && (
          <div className="mt-1 flex flex-wrap gap-2">
            {space.kind === 'street' && prop.houses < 5 && !prop.mortgaged && (
              <Button size="sm" tone="primary" onClick={() => connection.act({ type: 'build', space: index })}>
                {prop.houses === 4 ? 'Build hotel' : 'Build house'}
              </Button>
            )}
            {space.kind === 'street' && prop.houses > 0 && (
              <Button size="sm" onClick={() => connection.act({ type: 'sellBuilding', space: index })}>
                Sell building
              </Button>
            )}
            {!prop.mortgaged && !setHasBuildings(game, index) && (
              <Button size="sm" onClick={() => connection.act({ type: 'mortgage', space: index })}>
                Mortgage for {money(mortgageValue(game, index))}
              </Button>
            )}
            {prop.mortgaged && (
              <Button size="sm" onClick={() => connection.act({ type: 'unmortgage', space: index })}>
                Pay off for {money(unmortgageCost(game, index))}
              </Button>
            )}
          </div>
        )}

        {theirs && playing && game.settings.trading && (
          <Button size="sm" className="mt-1 self-start" onClick={() => onTrade(index)}>
            Offer a trade for it
          </Button>
        )}
      </div>
    </div>
  );
}
