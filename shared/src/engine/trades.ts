import type { Bundle, GameEvent, GameState, PlayerState, TradeOffer } from '../types.ts';
import { emit, fail, findPlayer, inDebt, isActive, mortgageInterest, spaceHasBuildingsInSet } from './helpers.ts';
import { charge } from './money.ts';

const MAX_OPEN_OFFERS = 5;

function isEmpty(bundle: Bundle): boolean {
  return bundle.properties.length === 0 && bundle.cash === 0 && bundle.jailCards === 0;
}

function bundleProblem(state: GameState, owner: PlayerState, bundle: Bundle, checkCash: boolean): string | null {
  if (!Array.isArray(bundle.properties)) return 'badBundle';
  if (new Set(bundle.properties).size !== bundle.properties.length) return 'badBundle';
  if (!Number.isInteger(bundle.cash) || bundle.cash < 0) return 'badBundle';
  if (!Number.isInteger(bundle.jailCards) || bundle.jailCards < 0) return 'badBundle';

  for (const index of bundle.properties) {
    if (!Number.isInteger(index) || !state.props[index]) return 'notProperty';
    if (state.props[index]!.owner !== owner.id) return 'notOwner';
    if (spaceHasBuildingsInSet(state, index)) return 'setHasBuildings';
  }

  if (checkCash && owner.cash < bundle.cash) return 'cannotAfford';
  if (bundle.jailCards > owner.jailCards.length) return 'noJailCard';
  if (bundle.jailCards > 0 && !state.settings.jailCardsTradable) return 'jailCardsLocked';

  return null;
}

const MESSAGES: Record<string, string> = {
  badBundle: 'That offer is not valid.',
  notProperty: 'That space cannot be traded.',
  notOwner: 'A property in the offer has changed hands.',
  setHasBuildings: 'Sell the buildings in a set before trading any of it.',
  cannotAfford: 'Not enough cash for this offer.',
  noJailCard: 'Not enough get-out cards for this offer.',
  jailCardsLocked: 'Get-out cards cannot be traded in this game.'
};

function requireValidBundle(state: GameState, owner: PlayerState, bundle: Bundle, checkCash: boolean): void {
  const problem = bundleProblem(state, owner, bundle, checkCash);
  if (problem) fail(problem, MESSAGES[problem]);
}

function cleanBundle(bundle: Bundle): Bundle {
  return {
    properties: [...(bundle.properties ?? [])],
    cash: bundle.cash ?? 0,
    jailCards: bundle.jailCards ?? 0
  };
}

export function proposeTrade(
  state: GameState,
  player: PlayerState,
  to: string,
  give: Bundle,
  get: Bundle,
  now: number,
  events: GameEvent[]
): TradeOffer {
  const s = state.settings;
  if (!s.trading) fail('tradingOff', 'Trading is turned off in this game.');
  if (s.tradeOnlyOwnTurn && state.turn.player !== player.id && !inDebt(state, player.id)) {
    fail('notYourTurn', 'You can only send offers on your own turn.');
  }

  const target = findPlayer(state, to);
  if (target.id === player.id) fail('selfTrade', 'You cannot trade with yourself.');
  if (!isActive(target)) fail('notActive', 'That player is out of the game.');

  const offer = cleanBundle(give);
  const request = cleanBundle(get);
  if (isEmpty(offer) && isEmpty(request)) fail('emptyTrade', 'Add something to the offer.');
  if (state.trades.filter((t) => t.from === player.id).length >= MAX_OPEN_OFFERS) {
    fail('tooManyOffers', `You can have at most ${MAX_OPEN_OFFERS} open offers.`);
  }

  requireValidBundle(state, player, offer, true);
  requireValidBundle(state, target, request, false);

  const trade: TradeOffer = { id: state.nextTradeId++, from: player.id, to: target.id, give: offer, get: request, createdAt: now };
  state.trades.push(trade);
  emit(state, events, { type: 'tradeProposed', player: player.id, target: target.id, amount: trade.id });
  return trade;
}

function findTrade(state: GameState, id: number): TradeOffer {
  const trade = state.trades.find((t) => t.id === id);
  if (!trade) fail('noTrade', 'That offer is no longer open.');
  return trade;
}

function removeTrade(state: GameState, id: number): void {
  state.trades = state.trades.filter((t) => t.id !== id);
}

function moveCashAndCards(from: PlayerState, to: PlayerState, bundle: Bundle): void {
  from.cash -= bundle.cash;
  to.cash += bundle.cash;

  const cards = from.jailCards.splice(from.jailCards.length - bundle.jailCards, bundle.jailCards);
  to.jailCards.push(...cards);
}

function moveProperties(state: GameState, to: PlayerState, bundle: Bundle, events: GameEvent[]): void {
  for (const index of bundle.properties) {
    const prop = state.props[index]!;
    prop.owner = to.id;
    if (prop.mortgaged && state.settings.interestOnTradedMortgage) {
      charge(state, to, { kind: 'bank' }, mortgageInterest(state, index), 'mortgageInterest', events);
    }
  }
}

export function acceptTrade(state: GameState, player: PlayerState, id: number, events: GameEvent[]): void {
  const trade = findTrade(state, id);
  if (trade.to !== player.id) fail('notYourOffer', 'That offer is not for you.');
  if (state.auction) fail('auctionOpen', 'Wait for the auction to finish.');

  const from = findPlayer(state, trade.from);
  requireValidBundle(state, from, trade.give, true);
  requireValidBundle(state, player, trade.get, true);

  removeTrade(state, id);
  moveCashAndCards(from, player, trade.give);
  moveCashAndCards(player, from, trade.get);
  moveProperties(state, player, trade.give, events);
  moveProperties(state, from, trade.get, events);
  emit(state, events, { type: 'tradeAccepted', player: trade.from, target: trade.to, amount: trade.id });
}

export function declineTrade(state: GameState, player: PlayerState, id: number, events: GameEvent[]): void {
  const trade = findTrade(state, id);
  if (trade.to !== player.id) fail('notYourOffer', 'That offer is not for you.');

  removeTrade(state, id);
  emit(state, events, { type: 'tradeDeclined', player: trade.from, target: trade.to, amount: trade.id });
}

export function cancelTrade(state: GameState, player: PlayerState, id: number, events: GameEvent[]): void {
  const trade = findTrade(state, id);
  if (trade.from !== player.id) fail('notYourOffer', 'Only the sender can cancel an offer.');

  removeTrade(state, id);
  emit(state, events, { type: 'tradeCancelled', player: trade.from, target: trade.to, detail: 'cancelled' });
}

export function counterTrade(
  state: GameState,
  player: PlayerState,
  id: number,
  give: Bundle,
  get: Bundle,
  now: number,
  events: GameEvent[]
): void {
  const trade = findTrade(state, id);
  if (trade.to !== player.id) fail('notYourOffer', 'That offer is not for you.');

  proposeTrade(state, player, trade.from, give, get, now, events);
  removeTrade(state, id);
  emit(state, events, { type: 'tradeCountered', player: trade.from, target: trade.to, amount: trade.id });
}

export function cleanupTrades(state: GameState, events: GameEvent[]): void {
  const keep: TradeOffer[] = [];

  for (const trade of state.trades) {
    const from = state.players.find((p) => p.id === trade.from);
    const to = state.players.find((p) => p.id === trade.to);
    let valid = !!from && !!to && isActive(from) && isActive(to);

    if (valid) {
      const fromProblem = bundleProblem(state, from!, trade.give, false);
      const toProblem = bundleProblem(state, to!, trade.get, false);
      valid = fromProblem === null && toProblem === null;
    }

    if (valid) keep.push(trade);
    else emit(state, events, { type: 'tradeCancelled', player: trade.from, target: trade.to, detail: 'invalid' });
  }

  state.trades = keep;
}
