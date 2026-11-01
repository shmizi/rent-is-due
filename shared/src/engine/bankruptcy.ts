import type { Debt, DeckId, GameEvent, GameState, PlayerState } from '../types.ts';
import { DECKS } from '../cards.ts';
import { startQueuedAuction, removeBidder } from './auction.ts';
import { emit, fail, findPlayer, houseCost, inDebt, mortgageInterest, ownedSpaces } from './helpers.ts';
import { charge, payFromBank, receive } from './money.ts';
import { advanceTurn, checkLastStanding } from './turnOrder.ts';

export function returnJailCard(state: GameState, deck: DeckId): void {
  const order = state.decks[deck];
  const index = DECKS[deck].cards.findIndex((c, i) => c.effect.type === 'jailCard' && !order.includes(i));
  if (index >= 0) order.push(index);
}

function sellAllBuildings(state: GameState, player: PlayerState): void {
  for (const i of ownedSpaces(state, player.id)) {
    const prop = state.props[i]!;
    if (prop.houses === 0) continue;
    payFromBank(state, player, Math.floor((prop.houses * houseCost(state, i) * state.settings.sellBackPercent) / 100));
    prop.houses = 0;
  }
}

function payCreditorsProRata(state: GameState, player: PlayerState, debts: Debt[]): void {
  const available = player.cash;
  const owed = debts.reduce((sum, d) => sum + d.amount, 0);
  let left = available;

  if (owed > 0) {
    for (const debt of debts) {
      const share = Math.min(debt.amount, Math.floor((available * debt.amount) / owed));
      receive(state, debt.creditor, share);
      left -= share;
    }
  }

  if (left > 0) state.bankNet -= left;
  player.cash = 0;
}

export function eliminate(state: GameState, player: PlayerState, mode: 'bankrupt' | 'left', now: number, events: GameEvent[]): void {
  const debts = state.debts.filter((d) => d.debtor === player.id);
  const first = debts[0]?.creditor;
  const singleCreditor =
    first?.kind === 'player' && debts.every((d) => d.creditor.kind === 'player' && d.creditor.id === first.id) ? first.id : null;
  const toPlayer = mode === 'bankrupt' && singleCreditor !== null;

  sellAllBuildings(state, player);

  if (toPlayer) {
    const creditor = findPlayer(state, singleCreditor);
    creditor.cash += player.cash;
    player.cash = 0;

    for (const i of ownedSpaces(state, player.id)) {
      const prop = state.props[i]!;
      prop.owner = creditor.id;
      if (prop.mortgaged && state.settings.interestOnTradedMortgage) {
        charge(state, creditor, { kind: 'bank' }, mortgageInterest(state, i), 'mortgageInterest', events);
      }
    }

    creditor.jailCards.push(...player.jailCards);
    player.jailCards = [];
  } else {
    payCreditorsProRata(state, player, debts);

    const auctionThem = state.settings.bankruptProperties === 'auction' && state.settings.auctions;
    for (const i of ownedSpaces(state, player.id)) {
      state.props[i] = { owner: null, houses: 0, mortgaged: false };
      if (auctionThem) state.auctionQueue.push(i);
    }

    for (const deck of player.jailCards) returnJailCard(state, deck);
    player.jailCards = [];
  }

  player.status = mode === 'bankrupt' ? 'bankrupt' : 'left';
  player.inJail = false;
  player.jailTurns = 0;
  player.away = null;

  state.debts = state.debts.filter((d) => d.debtor !== player.id);
  for (const debt of state.debts) {
    if (debt.creditor.kind === 'player' && debt.creditor.id === player.id) debt.creditor = { kind: 'bank' };
  }

  const cancelled = state.trades.filter((t) => t.from === player.id || t.to === player.id);
  state.trades = state.trades.filter((t) => t.from !== player.id && t.to !== player.id);
  for (const trade of cancelled) emit(state, events, { type: 'tradeCancelled', player: trade.from, target: trade.to, detail: 'playerOut' });

  emit(state, events, { type: mode === 'bankrupt' ? 'bankrupt' : 'left', player: player.id, target: toPlayer ? singleCreditor : undefined });

  removeBidder(state, player.id, now, events);

  if (checkLastStanding(state, events)) return;
  if (state.turn.player === player.id) advanceTurn(state, events);
  startQueuedAuction(state, now, events);
}

export function declareBankruptcy(state: GameState, player: PlayerState, now: number, events: GameEvent[]): void {
  if (!inDebt(state, player.id)) fail('notInDebt', 'You can only declare bankruptcy while you owe money.');
  eliminate(state, player, 'bankrupt', now, events);
}
