import type { GameEvent, GameState, PlayerState } from '../types.ts';
import { emit, fail, findPlayer, frozenNow, isActive } from './helpers.ts';
import { charge } from './money.ts';

const BID_EXTENSION_MS = 5000;

export function startAuction(
  state: GameState,
  space: number,
  source: 'declined' | 'bankruptcy',
  now: number,
  events: GameEvent[]
): boolean {
  const bidders = state.players.filter((p) => isActive(p) && p.connected).map((p) => p.id);
  if (bidders.length === 0) return false;

  state.auction = {
    id: state.nextAuctionId++,
    space,
    highBid: 0,
    highBidder: null,
    bidders,
    deadline: frozenNow(state, now) + state.settings.room.auctionTimerSec * 1000,
    source
  };

  emit(state, events, { type: 'auctionStarted', space });
  return true;
}

export function startQueuedAuction(state: GameState, now: number, events: GameEvent[]): void {
  while (!state.auction && state.auctionQueue.length > 0 && state.status === 'playing') {
    const space = state.auctionQueue.shift()!;
    if (state.props[space]?.owner !== null) continue;
    if (!startAuction(state, space, 'bankruptcy', now, events)) state.auctionQueue = [];
  }
}

export function finishAuction(state: GameState, now: number, events: GameEvent[]): void {
  const auction = state.auction;
  if (!auction) return;
  state.auction = null;

  if (auction.highBidder) {
    const winner = findPlayer(state, auction.highBidder);
    state.props[auction.space] = { owner: winner.id, houses: 0, mortgaged: false };
    charge(state, winner, { kind: 'bank' }, auction.highBid, 'auction', events);
    emit(state, events, { type: 'auctionWon', player: winner.id, space: auction.space, amount: auction.highBid });
  } else {
    emit(state, events, { type: 'auctionUnsold', space: auction.space });
  }

  startQueuedAuction(state, now, events);
}

export function checkAuctionEnd(state: GameState, now: number, events: GameEvent[]): void {
  const auction = state.auction;
  if (!auction) return;

  const onlyLeader = auction.bidders.length === 1 && auction.bidders[0] === auction.highBidder;
  if (auction.bidders.length === 0 || onlyLeader) finishAuction(state, now, events);
}

export function removeBidder(state: GameState, id: string, now: number, events: GameEvent[]): void {
  const auction = state.auction;
  if (!auction) return;

  auction.bidders = auction.bidders.filter((b) => b !== id);
  if (auction.highBidder === id) {
    auction.highBidder = null;
    auction.highBid = 0;
  }

  checkAuctionEnd(state, now, events);
}

function currentAuction(state: GameState, id: number) {
  const auction = state.auction;
  if (!auction) fail('noAuction', 'There is no auction running.');
  if (auction.id !== id) fail('auctionOver', 'That auction has ended.');
  return auction;
}

export function placeBid(state: GameState, player: PlayerState, id: number, amount: number, now: number, events: GameEvent[]): void {
  const auction = currentAuction(state, id);
  if (!auction.bidders.includes(player.id)) fail('notBidding', 'You are not in this auction.');
  if (!Number.isInteger(amount) || amount <= auction.highBid) fail('bidTooLow', 'Your bid must beat the top bid.');
  if (amount > player.cash) fail('cannotAfford', 'You cannot bid more than your cash.');

  auction.highBid = amount;
  auction.highBidder = player.id;
  auction.deadline = Math.max(auction.deadline, now + BID_EXTENSION_MS);
  emit(state, events, { type: 'bid', player: player.id, space: auction.space, amount });

  checkAuctionEnd(state, now, events);
}

export function dropOut(state: GameState, player: PlayerState, id: number, now: number, events: GameEvent[]): void {
  const auction = currentAuction(state, id);
  if (!auction.bidders.includes(player.id)) fail('notBidding', 'You are not in this auction.');
  if (auction.highBidder === player.id) fail('leadingBid', 'You have the top bid, so you cannot drop out.');

  auction.bidders = auction.bidders.filter((b) => b !== player.id);
  emit(state, events, { type: 'droppedOut', player: player.id, space: auction.space });

  checkAuctionEnd(state, now, events);
}
