import { ownsWholeGroup } from '../../../shared/src/engine/helpers.ts';
import { getMap } from '../../../shared/src/maps/index.ts';
import type { GameState } from '../../../shared/src/types.ts';
import type { GameView } from '../../../shared/src/view.ts';

const ALIASES: { flag: string; name: string }[] = [{ flag: 'il', name: 'Benjamin Netanyahu' }];

export function aliasFor(game: GameView, playerId: string): string | null {
  const groups = Object.entries(getMap(game.mapId).groups);
  for (const alias of ALIASES) {
    const group = groups.find(([, g]) => g.flag === alias.flag)?.[0];
    if (group && ownsWholeGroup(game as unknown as GameState, playerId, group)) return alias.name;
  }
  return null;
}

export function withAliases(game: GameView): GameView {
  let changed = false;
  const players = game.players.map((p) => {
    const name = aliasFor(game, p.id);
    if (!name || name === p.name) return p;
    changed = true;
    return { ...p, name };
  });
  return changed ? { ...game, players } : game;
}
