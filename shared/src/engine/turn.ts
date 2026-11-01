import { rollDie } from '../rng.ts';
import type { GameEvent, GameState, PlayerState, TurnPhase } from '../types.ts';
import { startAuction } from './auction.ts';
import { returnJailCard } from './bankruptcy.ts';
import { emit, fail, propertySpace } from './helpers.ts';
import { charge, feeCreditor, payToBank } from './money.ts';
import { moveBy, resolveLanding, sendToJail } from './movement.ts';
import { advanceTurn } from './turnOrder.ts';

function requireTurn(state: GameState, player: PlayerState, phases: TurnPhase[]): void {
  if (state.turn.player !== player.id) fail('notYourTurn', 'It is not your turn.');
  if (!phases.includes(state.turn.phase)) fail('wrongPhase', 'You cannot do that right now.');
}

function requireCalm(state: GameState): void {
  if (state.auction) fail('auctionOpen', 'Wait for the auction to finish.');
  if (state.debts.length > 0) fail('debtOpen', 'Wait until every debt is settled.');
}

export function roll(state: GameState, player: PlayerState, events: GameEvent[]): void {
  requireTurn(state, player, ['preRoll', 'postRoll']);
  requireCalm(state);
  if (state.turn.phase === 'postRoll' && !state.turn.canRollAgain) fail('alreadyRolled', 'You have already rolled.');

  const s = state.settings;
  const d1 = rollDie(state);
  const d2 = rollDie(state);
  const doubles = d1 === d2;
  const ctx = { diceTotal: d1 + d2 };

  state.turn.lastRoll = [d1, d2];
  state.turn.rolls++;
  state.turn.phase = 'postRoll';
  state.turn.canRollAgain = false;
  emit(state, events, { type: 'rolled', player: player.id, detail: `${d1}+${d2}` });

  if (player.inJail) {
    if (doubles) {
      player.inJail = false;
      player.jailTurns = 0;
      emit(state, events, { type: 'leftJail', player: player.id, detail: 'doubles' });
      moveBy(state, player, d1 + d2, events);
      resolveLanding(state, player, ctx, events);
      return;
    }

    player.jailTurns++;
    if (player.jailTurns >= s.maxJailTurns) {
      charge(state, player, feeCreditor(state, 'jailFines'), s.jailFine, 'jailFine', events);
      player.inJail = false;
      player.jailTurns = 0;
      emit(state, events, { type: 'leftJail', player: player.id, detail: 'forced' });
      moveBy(state, player, d1 + d2, events);
      resolveLanding(state, player, ctx, events);
    }
    return;
  }

  if (doubles) {
    state.turn.doubles++;
    if (s.threeDoublesJail && state.turn.doubles >= 3) {
      sendToJail(state, player, events);
      return;
    }
  }

  moveBy(state, player, d1 + d2, events);
  resolveLanding(state, player, ctx, events);
  state.turn.canRollAgain = doubles && s.rollAgainOnDoubles && !player.inJail;
}

export function payJailFine(state: GameState, player: PlayerState, events: GameEvent[]): void {
  requireTurn(state, player, ['preRoll']);
  requireCalm(state);
  if (!player.inJail) fail('notInJail', 'You are not at the Visa Office.');
  if (player.cash < state.settings.jailFine) fail('cannotAfford', 'You cannot afford the fine.');

  charge(state, player, feeCreditor(state, 'jailFines'), state.settings.jailFine, 'jailFine', events);
  player.inJail = false;
  player.jailTurns = 0;
  emit(state, events, { type: 'leftJail', player: player.id, detail: 'paid' });
}

export function useJailCard(state: GameState, player: PlayerState, events: GameEvent[]): void {
  requireTurn(state, player, ['preRoll']);
  requireCalm(state);
  if (!player.inJail) fail('notInJail', 'You are not at the Visa Office.');

  const deck = player.jailCards.pop();
  if (!deck) fail('noJailCard', 'You do not have a get-out card.');

  returnJailCard(state, deck);
  player.inJail = false;
  player.jailTurns = 0;
  emit(state, events, { type: 'leftJail', player: player.id, detail: 'card' });
}

export function buy(state: GameState, player: PlayerState, events: GameEvent[]): void {
  requireTurn(state, player, ['buyDecision']);
  requireCalm(state);

  const index = state.turn.pendingBuy!;
  const price = propertySpace(state, index).price;
  if (player.cash < price) fail('cannotAfford', 'You do not have enough cash.');

  payToBank(state, player, price);
  state.props[index] = { owner: player.id, houses: 0, mortgaged: false };
  state.turn.phase = 'postRoll';
  state.turn.pendingBuy = null;
  emit(state, events, { type: 'bought', player: player.id, space: index, amount: price });
}

export function decline(state: GameState, player: PlayerState, now: number, events: GameEvent[]): void {
  requireTurn(state, player, ['buyDecision']);
  requireCalm(state);

  const index = state.turn.pendingBuy!;
  state.turn.phase = 'postRoll';
  state.turn.pendingBuy = null;
  emit(state, events, { type: 'declined', player: player.id, space: index });

  if (state.settings.auctions) startAuction(state, index, 'declined', now, events);
}

export function endTurn(state: GameState, player: PlayerState, events: GameEvent[]): void {
  requireTurn(state, player, ['postRoll']);
  requireCalm(state);
  if (state.turn.canRollAgain) fail('mustRollAgain', 'You rolled doubles, so roll again.');

  advanceTurn(state, events);
}
