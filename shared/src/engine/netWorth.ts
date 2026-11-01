import type { GameState, PlayerId, PropertySpace } from '../types.ts';
import { findPlayer, mapOf, unmortgageCost } from './helpers.ts';

export function netWorth(state: GameState, id: PlayerId): number {
  const map = mapOf(state);
  let total = findPlayer(state, id).cash;

  state.props.forEach((prop, i) => {
    if (!prop || prop.owner !== id) return;

    const space = map.spaces[i] as PropertySpace;
    total += prop.mortgaged ? space.price - unmortgageCost(state, i) : space.price;

    if (space.kind === 'street') total += prop.houses * map.groups[space.group].houseCost;
  });

  for (const debt of state.debts) {
    if (debt.debtor === id) total -= debt.amount;
  }

  return total;
}

export function rankPlayers(state: GameState, ids: PlayerId[]): PlayerId[] {
  return [...ids].sort((a, b) => {
    const byWorth = netWorth(state, b) - netWorth(state, a);
    if (byWorth !== 0) return byWorth;
    return findPlayer(state, b).cash - findPlayer(state, a).cash;
  });
}

export function leaders(state: GameState, ids: PlayerId[]): PlayerId[] {
  const ranked = rankPlayers(state, ids);
  if (ranked.length === 0) return [];

  const top = ranked[0];
  const topWorth = netWorth(state, top);
  const topCash = findPlayer(state, top).cash;

  return ranked.filter((id) => netWorth(state, id) === topWorth && findPlayer(state, id).cash === topCash);
}
