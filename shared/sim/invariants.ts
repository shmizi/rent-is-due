import { DECKS } from '../src/cards.ts';
import { groupStreets, isActive, mapOf } from '../src/engine/helpers.ts';
import type { DeckId, GameState } from '../src/types.ts';

export function findViolations(state: GameState): string[] {
  const problems: string[] = [];
  const map = mapOf(state);
  const active = new Set(state.players.filter(isActive).map((p) => p.id));

  const cash = state.players.reduce((sum, p) => sum + p.cash, 0);
  if (cash + state.jackpot !== state.initialMoney + state.bankNet) {
    problems.push(`Money does not add up: cash ${cash} + jackpot ${state.jackpot} != ${state.initialMoney} + ${state.bankNet}`);
  }

  for (const p of state.players) {
    if (p.cash < 0) problems.push(`${p.id} has negative cash ${p.cash}`);
    if (!Number.isInteger(p.cash)) problems.push(`${p.id} has fractional cash ${p.cash}`);
    if (!isActive(p) && (p.cash !== 0 || p.jailCards.length > 0)) problems.push(`${p.id} is out but still holds cash or cards`);
  }

  state.props.forEach((prop, i) => {
    const space = map.spaces[i];
    if (!prop) return;

    if (prop.owner === null && (prop.houses > 0 || prop.mortgaged)) problems.push(`Unowned space ${i} has buildings or a mortgage`);
    if (prop.owner !== null && !active.has(prop.owner)) problems.push(`Space ${i} is owned by inactive ${prop.owner}`);
    if (prop.houses < 0 || prop.houses > 5) problems.push(`Space ${i} has ${prop.houses} buildings`);
    if (prop.houses > 0 && space.kind !== 'street') problems.push(`Non-street ${i} has buildings`);
    if (prop.houses > 0 && prop.mortgaged) problems.push(`Space ${i} is mortgaged with buildings`);
  });

  for (const group of Object.keys(map.groups)) {
    const streets = groupStreets(map, group);
    const built = streets.some((i) => state.props[i]!.houses > 0);
    if (!built) continue;

    if (streets.some((i) => state.props[i]!.mortgaged)) problems.push(`Group ${group} has buildings and a mortgage`);

    const owners = new Set(streets.map((i) => state.props[i]!.owner));
    if (state.settings.fullSetToBuild && owners.size !== 1) problems.push(`Group ${group} is built without a full set`);

    if (state.settings.evenBuilding) {
      for (const owner of owners) {
        const levels = streets.filter((i) => state.props[i]!.owner === owner).map((i) => state.props[i]!.houses);
        if (Math.max(...levels) - Math.min(...levels) > 1) problems.push(`Group ${group} is built unevenly`);
      }
    }
  }

  for (const deck of Object.keys(DECKS) as DeckId[]) {
    const total = DECKS[deck].cards.length;
    const held = state.players.reduce((sum, p) => sum + p.jailCards.filter((d) => d === deck).length, 0);
    if (state.decks[deck].length + held !== total) problems.push(`Deck ${deck} has ${state.decks[deck].length} cards plus ${held} held`);
    if (new Set(state.decks[deck]).size !== state.decks[deck].length) problems.push(`Deck ${deck} has duplicate cards`);
  }

  for (const debt of state.debts) {
    if (debt.amount <= 0) problems.push('A debt has a non-positive amount');
    if (!active.has(debt.debtor)) problems.push(`Debtor ${debt.debtor} is not active`);
  }

  for (const trade of state.trades) {
    if (!active.has(trade.from) || !active.has(trade.to)) problems.push(`Trade ${trade.id} involves an inactive player`);
  }

  if (state.auction) {
    if (state.auction.bidders.some((b) => !active.has(b))) problems.push('An inactive player is bidding');
    if (state.props[state.auction.space]!.owner !== null) problems.push('An owned property is being auctioned');
  }

  if (state.status === 'playing') {
    if (!active.has(state.turn.player)) problems.push(`Current player ${state.turn.player} is not active`);
    if (active.size < 2) problems.push('The game is still running with fewer than 2 players');
  } else if (state.winners.length === 0 && active.size > 0) {
    problems.push('The game finished without a winner');
  }

  return problems;
}
