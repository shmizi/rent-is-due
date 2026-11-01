import { netWorth } from '../../../shared/src/engine/netWorth.ts';
import { getMap } from '../../../shared/src/maps/index.ts';
import type { MemberView } from '../../../shared/src/protocol.ts';
import type { GameState, MapDef, PlayerState, PropertySpace, SpaceDef } from '../../../shared/src/types.ts';
import type { GameView } from '../../../shared/src/view.ts';

export function mapFor(game: GameView): MapDef {
  return getMap(game.mapId);
}

export function isProperty(space: SpaceDef): space is PropertySpace {
  return space.kind === 'street' || space.kind === 'transit' || space.kind === 'utility';
}

export function playerById(game: GameView, id: string | null | undefined): PlayerState | undefined {
  return id ? game.players.find((p) => p.id === id) : undefined;
}

export function worth(game: GameView, id: string): number {
  return netWorth(game as unknown as GameState, id);
}

export function ownedBy(game: GameView, id: string): number[] {
  return game.props.flatMap((p, i) => (p?.owner === id ? [i] : []));
}

export function groupStreets(map: MapDef, group: string): number[] {
  return map.spaces.flatMap((s, i) => (s.kind === 'street' && s.group === group ? [i] : []));
}

export function setHasBuildings(game: GameView, index: number): boolean {
  const space = mapFor(game).spaces[index];
  if (space.kind !== 'street') return false;
  return groupStreets(mapFor(game), space.group).some((i) => (game.props[i]?.houses ?? 0) > 0);
}

export function mortgageValue(game: GameView, index: number): number {
  const space = mapFor(game).spaces[index] as PropertySpace;
  return Math.round((space.price * game.settings.mortgagePercent) / 100);
}

export function unmortgageCost(game: GameView, index: number): number {
  const value = mortgageValue(game, index);
  return value + Math.round((value * game.settings.unmortgageInterestPercent) / 100);
}

export function memberLook(members: MemberView[] | undefined, id: string): { color: string; shape: string } {
  const member = members?.find((m) => m.id === id);
  return { color: member?.color ?? '#9AA0C8', shape: member?.shape ?? 'circle' };
}

export function inkFor(color: string): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#1D1B2E' : '#FFFFFF';
}

export function sidePosition(index: number, size: number): { row: number; col: number; side: 'bottom' | 'left' | 'top' | 'right' | 'corner' } {
  const k = size / 4;
  if (index <= k) return { row: k + 1, col: k + 1 - index, side: index % k === 0 ? 'corner' : 'bottom' };
  if (index <= 2 * k) return { row: k + 1 - (index - k), col: 1, side: index === 2 * k ? 'corner' : 'left' };
  if (index <= 3 * k) return { row: 1, col: 1 + (index - 2 * k), side: index === 3 * k ? 'corner' : 'top' };
  return { row: 1 + (index - 3 * k), col: k + 1, side: 'right' };
}
