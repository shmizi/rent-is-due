import { findPlayer, groupStreets, houseCost, inDebt, isActive, mapOf, ownedSpaces, ownsWholeGroup, propertySpace, spaceHasBuildingsInSet, unmortgageCost } from '../src/engine/helpers.ts';
import type { Action, Bundle, GameState, PlayerId } from '../src/types.ts';

export type Rand = () => number;

const RESERVE = 150;

function wouldComplete(state: GameState, me: PlayerId, index: number): boolean {
  const space = mapOf(state).spaces[index];
  if (space.kind !== 'street') return false;
  return groupStreets(mapOf(state), space.group).every((i) => i === index || state.props[i]?.owner === me);
}

function valueToMe(state: GameState, bundle: Bundle, me: PlayerId, receiving: boolean): number {
  const properties = bundle.properties.reduce((sum, i) => {
    const price = propertySpace(state, i).price;
    if (receiving) return sum + price * (wouldComplete(state, me, i) ? 2.5 : 1);
    const losesSet = state.props[i]?.owner === me && wouldComplete(state, me, i);
    return sum + price * (losesSet ? 3 : 1);
  }, 0);
  return bundle.cash + bundle.jailCards * 50 + properties;
}

function raiseCash(state: GameState, me: PlayerId): Action[] {
  const mine = ownedSpaces(state, me);
  const out: Action[] = [];

  const built = mine.filter((i) => state.props[i]!.houses > 0).sort((a, b) => state.props[b]!.houses - state.props[a]!.houses);
  for (const space of built) out.push({ type: 'sellBuilding', player: me, space });

  const mortgageable = mine
    .filter((i) => !state.props[i]!.mortgaged && !spaceHasBuildingsInSet(state, i))
    .sort((a, b) => propertySpace(state, a).price - propertySpace(state, b).price);
  for (const space of mortgageable) out.push({ type: 'mortgage', player: me, space });

  out.push({ type: 'declareBankruptcy', player: me });
  return out;
}

function buildActions(state: GameState, me: PlayerId): Action[] {
  const map = mapOf(state);
  const cash = findPlayer(state, me).cash;
  const out: Action[] = [];

  for (const group of Object.keys(map.groups)) {
    if (!ownsWholeGroup(state, me, group)) continue;

    const streets = groupStreets(map, group);
    if (streets.some((i) => state.props[i]!.mortgaged)) continue;

    const target = streets.filter((i) => state.props[i]!.houses < 5).sort((a, b) => state.props[a]!.houses - state.props[b]!.houses)[0];
    if (target === undefined) continue;
    if (cash - houseCost(state, target) < RESERVE) continue;

    out.push({ type: 'build', player: me, space: target });
  }

  return out;
}

function unmortgageActions(state: GameState, me: PlayerId): Action[] {
  const cash = findPlayer(state, me).cash;
  return ownedSpaces(state, me)
    .filter((i) => state.props[i]!.mortgaged && cash - unmortgageCost(state, i) > RESERVE * 3)
    .map((space) => ({ type: 'unmortgage', player: me, space }) as Action);
}

function tradeProposal(state: GameState, me: PlayerId, rand: Rand): Action | null {
  const map = mapOf(state);
  const player = findPlayer(state, me);

  for (const group of Object.keys(map.groups)) {
    const streets = groupStreets(map, group);
    const missing = streets.filter((i) => state.props[i]!.owner !== me);
    if (missing.length !== 1) continue;

    const owner = state.props[missing[0]]!.owner;
    if (owner === null || owner === me || spaceHasBuildingsInSet(state, missing[0])) continue;
    if (!isActive(findPlayer(state, owner))) continue;

    const sweetener = ownedSpaces(state, me).find(
      (i) => !streets.includes(i) && !spaceHasBuildingsInSet(state, i) && wouldComplete(state, owner, i)
    );
    if (sweetener !== undefined && rand() < 0.7) {
      return {
        type: 'proposeTrade',
        player: me,
        to: owner,
        give: { properties: [sweetener], cash: 0, jailCards: 0 },
        get: { properties: [missing[0]], cash: 0, jailCards: 0 }
      };
    }

    const cash = Math.min(player.cash - 50, Math.round(propertySpace(state, missing[0]).price * (1.4 + rand())));
    if (cash <= 0) continue;

    return {
      type: 'proposeTrade',
      player: me,
      to: owner,
      give: { properties: [], cash, jailCards: 0 },
      get: { properties: [missing[0]], cash: 0, jailCards: 0 }
    };
  }

  if (player.jailCards.length > 0 && rand() < 0.3) {
    const others = state.players.filter((p) => p.id !== me && isActive(p));
    const buyer = others[Math.floor(rand() * others.length)];
    if (buyer) {
      return {
        type: 'proposeTrade',
        player: me,
        to: buyer.id,
        give: { properties: [], cash: 0, jailCards: 1 },
        get: { properties: [], cash: 40, jailCards: 0 }
      };
    }
  }

  return null;
}

export function botActions(state: GameState, me: PlayerId, rand: Rand): Action[] {
  const player = findPlayer(state, me);
  if (state.status !== 'playing' || !isActive(player) || !player.connected) return [];

  if (state.auction) {
    const auction = state.auction;
    if (!auction.bidders.includes(me) || auction.highBidder === me) return [];

    const price = propertySpace(state, auction.space).price;
    const want = wouldComplete(state, me, auction.space) ? 2 : 1;
    const limit = Math.min(player.cash - 25, Math.round(price * (0.6 + rand() * 0.7) * want));
    const bid = auction.highBid + 1 + Math.floor(rand() * 20);

    const out: Action[] = [];
    if (bid <= limit) out.push({ type: 'bid', player: me, auction: auction.id, amount: bid });
    out.push({ type: 'dropOut', player: me, auction: auction.id });
    return out;
  }

  if (inDebt(state, me)) return raiseCash(state, me);

  const offer = state.trades.find((t) => t.to === me);
  if (offer) {
    const gain = valueToMe(state, offer.give, me, true);
    const loss = valueToMe(state, offer.get, me, false);

    if (rand() < 0.05) {
      return [
        { type: 'counterTrade', player: me, trade: offer.id, give: offer.get, get: { ...offer.give, cash: offer.give.cash + 50 } },
        { type: 'declineTrade', player: me, trade: offer.id }
      ];
    }

    return [gain > loss * 1.05 ? { type: 'acceptTrade', player: me, trade: offer.id } : { type: 'declineTrade', player: me, trade: offer.id }, { type: 'declineTrade', player: me, trade: offer.id }];
  }

  if (state.turn.player !== me || state.debts.length > 0) return [];

  const out: Action[] = [];
  const phase = state.turn.phase;

  if (phase === 'buyDecision') {
    const index = state.turn.pendingBuy!;
    const price = propertySpace(state, index).price;
    if (player.cash - price >= RESERVE || wouldComplete(state, me, index) || rand() < 0.15) out.push({ type: 'buy', player: me });
    out.push({ type: 'decline', player: me });
    return out;
  }

  if (rand() < 0.6) out.push(...buildActions(state, me));
  if (rand() < 0.3) out.push(...unmortgageActions(state, me));
  if (rand() < 0.08) {
    const proposal = tradeProposal(state, me, rand);
    if (proposal) out.push(proposal);
  }

  if (phase === 'preRoll') {
    if (player.inJail && player.jailCards.length > 0 && rand() < 0.7) out.push({ type: 'useJailCard', player: me });
    if (player.inJail && player.cash > 400 && rand() < 0.5) out.push({ type: 'payJailFine', player: me });
    out.push({ type: 'roll', player: me });
    return out;
  }

  out.push(state.turn.canRollAgain ? { type: 'roll', player: me } : { type: 'endTurn', player: me });
  return out;
}
