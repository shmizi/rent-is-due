import { getMap } from '../maps/index.ts';
import type {
  GameEvent,
  GameState,
  MapDef,
  PlayerId,
  PlayerState,
  PropertySpace,
  PropertyState,
  SpaceDef
} from '../types.ts';

export class GameError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function fail(code: string, message: string): never {
  throw new GameError(code, message);
}

export function mapOf(state: GameState): MapDef {
  return getMap(state.mapId);
}

export function isPropertySpace(space: SpaceDef): space is PropertySpace {
  return space.kind === 'street' || space.kind === 'transit' || space.kind === 'utility';
}

export function propertySpace(state: GameState, index: number): PropertySpace {
  const space = mapOf(state).spaces[index];
  if (!space || !isPropertySpace(space)) fail('notProperty', 'That space cannot be owned.');
  return space;
}

export function propertyState(state: GameState, index: number): PropertyState {
  const prop = state.props[index];
  if (!prop) fail('notProperty', 'That space cannot be owned.');
  return prop;
}

export function findPlayer(state: GameState, id: PlayerId): PlayerState {
  const player = state.players.find((p) => p.id === id);
  if (!player) fail('unknownPlayer', 'That player is not in this game.');
  return player;
}

export function isActive(player: PlayerState): boolean {
  return player.status === 'active';
}

export function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter(isActive);
}

export function groupStreets(map: MapDef, group: string): number[] {
  const out: number[] = [];
  map.spaces.forEach((space, i) => {
    if (space.kind === 'street' && space.group === group) out.push(i);
  });
  return out;
}

export function ownsWholeGroup(state: GameState, owner: PlayerId, group: string): boolean {
  return groupStreets(mapOf(state), group).every((i) => state.props[i]?.owner === owner);
}

export function groupHasBuildings(state: GameState, group: string): boolean {
  return groupStreets(mapOf(state), group).some((i) => (state.props[i]?.houses ?? 0) > 0);
}

export function spaceHasBuildingsInSet(state: GameState, index: number): boolean {
  const space = propertySpace(state, index);
  return space.kind === 'street' && groupHasBuildings(state, space.group);
}

export function mortgageValue(state: GameState, index: number): number {
  return Math.round((propertySpace(state, index).price * state.settings.mortgagePercent) / 100);
}

export function mortgageInterest(state: GameState, index: number): number {
  return Math.round((mortgageValue(state, index) * state.settings.unmortgageInterestPercent) / 100);
}

export function unmortgageCost(state: GameState, index: number): number {
  return mortgageValue(state, index) + mortgageInterest(state, index);
}

export function houseCost(state: GameState, index: number): number {
  const space = propertySpace(state, index);
  if (space.kind !== 'street') fail('notStreet', 'Only streets can have buildings.');
  return mapOf(state).groups[space.group].houseCost;
}

export function inDebt(state: GameState, id: PlayerId): boolean {
  return state.debts.some((d) => d.debtor === id);
}

export function emit(state: GameState, events: GameEvent[], event: GameEvent): void {
  events.push(event);
  state.log.push(event);
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

export function ownedSpaces(state: GameState, id: PlayerId): number[] {
  const out: number[] = [];
  state.props.forEach((prop, i) => {
    if (prop && prop.owner === id) out.push(i);
  });
  return out;
}
