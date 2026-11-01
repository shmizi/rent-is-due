import type { GameEvent, GameState, PlayerState } from '../types.ts';
import {
  emit,
  fail,
  groupStreets,
  houseCost,
  mapOf,
  mortgageValue,
  ownsWholeGroup,
  propertySpace,
  propertyState,
  spaceHasBuildingsInSet,
  unmortgageCost
} from './helpers.ts';
import { payFromBank, payToBank } from './money.ts';

function requireOwnedStreet(state: GameState, player: PlayerState, index: number) {
  const space = propertySpace(state, index);
  const prop = propertyState(state, index);
  if (prop.owner !== player.id) fail('notOwner', 'You do not own that property.');
  if (space.kind !== 'street') fail('notStreet', 'Only streets can have buildings.');
  return { space, prop };
}

function myStreetsInGroup(state: GameState, player: PlayerState, group: string): number[] {
  return groupStreets(mapOf(state), group).filter((i) => state.props[i]?.owner === player.id);
}

export function build(state: GameState, player: PlayerState, index: number, events: GameEvent[]): void {
  const s = state.settings;
  const { space, prop } = requireOwnedStreet(state, player, index);
  const group = groupStreets(mapOf(state), space.group);

  if (state.auction) fail('auctionOpen', 'Wait for the auction to finish.');
  if (s.buildOnlyOwnTurn && state.turn.player !== player.id) fail('notYourTurn', 'You can only build on your own turn.');
  if (s.fullSetToBuild && !ownsWholeGroup(state, player.id, space.group)) fail('needFullSet', 'You need the whole colour set to build.');
  if (group.some((i) => state.props[i]?.mortgaged)) fail('mortgagedInSet', 'Pay off the mortgages in this set first.');
  if (prop.houses >= 5) fail('maxBuildings', 'This street already has a hotel.');

  if (s.evenBuilding) {
    const lowest = Math.min(...myStreetsInGroup(state, player, space.group).map((i) => state.props[i]!.houses));
    if (prop.houses > lowest) fail('buildEvenly', 'Build evenly across the set.');
  }

  const cost = houseCost(state, index);
  if (player.cash < cost) fail('cannotAfford', 'You do not have enough cash.');

  payToBank(state, player, cost);
  prop.houses++;
  emit(state, events, { type: 'built', player: player.id, space: index, amount: prop.houses });
}

export function sellBuilding(state: GameState, player: PlayerState, index: number, events: GameEvent[]): void {
  const { space, prop } = requireOwnedStreet(state, player, index);
  if (prop.houses === 0) fail('noBuildings', 'There is nothing to sell on that street.');

  if (state.settings.evenBuilding) {
    const highest = Math.max(...myStreetsInGroup(state, player, space.group).map((i) => state.props[i]!.houses));
    if (prop.houses < highest) fail('sellEvenly', 'Sell evenly across the set.');
  }

  const refund = Math.floor((houseCost(state, index) * state.settings.sellBackPercent) / 100);
  payFromBank(state, player, refund);
  prop.houses--;
  emit(state, events, { type: 'sold', player: player.id, space: index, amount: refund });
}

export function mortgage(state: GameState, player: PlayerState, index: number, events: GameEvent[]): void {
  const prop = propertyState(state, index);
  if (prop.owner !== player.id) fail('notOwner', 'You do not own that property.');
  if (prop.mortgaged) fail('alreadyMortgaged', 'That property is already mortgaged.');
  if (spaceHasBuildingsInSet(state, index)) fail('setHasBuildings', 'Sell the buildings in this set first.');

  const value = mortgageValue(state, index);
  payFromBank(state, player, value);
  prop.mortgaged = true;
  emit(state, events, { type: 'mortgaged', player: player.id, space: index, amount: value });
}

export function unmortgage(state: GameState, player: PlayerState, index: number, events: GameEvent[]): void {
  const prop = propertyState(state, index);
  if (prop.owner !== player.id) fail('notOwner', 'You do not own that property.');
  if (!prop.mortgaged) fail('notMortgaged', 'That property is not mortgaged.');
  if (state.auction) fail('auctionOpen', 'Wait for the auction to finish.');

  const cost = unmortgageCost(state, index);
  if (player.cash < cost) fail('cannotAfford', 'You do not have enough cash.');

  payToBank(state, player, cost);
  prop.mortgaged = false;
  emit(state, events, { type: 'unmortgaged', player: player.id, space: index, amount: cost });
}
