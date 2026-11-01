import { DECKS } from '../cards.ts';
import { randomInt } from '../rng.ts';
import type { CardDef, CardTarget, DeckId, GameEvent, GameState, PlayerState } from '../types.ts';
import { activePlayers, emit, findPlayer, mapOf } from './helpers.ts';
import { charge, feeCreditor, payFromBank } from './money.ts';
import { rentFor, type RentContext } from './rent.ts';

function passStart(state: GameState, player: PlayerState, exact: boolean, events: GameEvent[]): void {
  const s = state.settings;
  const amount = s.salary * (exact && s.doubleSalaryOnStart ? 2 : 1);
  payFromBank(state, player, amount);
  player.laps++;
  emit(state, events, { type: 'salary', player: player.id, amount });
}

export function moveBy(state: GameState, player: PlayerState, steps: number, events: GameEvent[]): void {
  const n = mapOf(state).spaces.length;
  const from = player.position;
  const to = (((from + steps) % n) + n) % n;

  if (steps > 0 && from + steps >= n) passStart(state, player, to === 0, events);

  player.position = to;
  emit(state, events, { type: 'moved', player: player.id, space: to });
}

export function moveTo(state: GameState, player: PlayerState, target: number, events: GameEvent[]): void {
  const n = mapOf(state).spaces.length;
  moveBy(state, player, (target - player.position + n) % n, events);
}

export function jailIndex(state: GameState): number {
  return mapOf(state).spaces.findIndex((s) => s.kind === 'jail');
}

export function sendToJail(state: GameState, player: PlayerState, events: GameEvent[]): void {
  player.position = jailIndex(state);
  player.inJail = true;
  player.jailTurns = 0;

  if (state.turn.player === player.id) {
    state.turn.canRollAgain = false;
    state.turn.doubles = 0;
  }

  emit(state, events, { type: 'jailed', player: player.id });
}

function cardTarget(state: GameState, player: PlayerState, target: CardTarget): number {
  const spaces = mapOf(state).spaces;
  const n = spaces.length;
  const streets = spaces.flatMap((s, i) => (s.kind === 'street' ? [{ i, price: s.price }] : []));

  if (target === 'start') return 0;
  if (target === 'priciestStreet') return streets.reduce((a, b) => (b.price > a.price ? b : a)).i;
  if (target === 'cheapestStreet') return streets.reduce((a, b) => (b.price < a.price ? b : a)).i;
  if (target === 'randomStreet') return streets[randomInt(state, 0, streets.length - 1)].i;

  const kind = target === 'nearestTransit' ? 'transit' : 'utility';
  for (let step = 1; step <= n; step++) {
    const i = (player.position + step) % n;
    if (spaces[i].kind === kind) return i;
  }

  return player.position;
}

function applyCard(state: GameState, player: PlayerState, card: CardDef, ctx: RentContext, events: GameEvent[]): void {
  const effect = card.effect;
  const others = activePlayers(state).filter((p) => p.id !== player.id);

  switch (effect.type) {
    case 'money':
      if (effect.amount >= 0) payFromBank(state, player, effect.amount);
      else charge(state, player, feeCreditor(state, 'cardFines'), -effect.amount, 'card', events);
      return;

    case 'moveTo':
      moveTo(state, player, cardTarget(state, player, effect.target), events);
      resolveLanding(state, player, { diceTotal: ctx.diceTotal, transitMultiplier: effect.transitMultiplier, utilityDice: effect.utilityDice }, events);
      return;

    case 'moveBy':
      moveBy(state, player, effect.steps, events);
      resolveLanding(state, player, { diceTotal: ctx.diceTotal }, events);
      return;

    case 'goToJail':
      sendToJail(state, player, events);
      return;

    case 'jailCard':
      return;

    case 'payEach':
      for (const other of others) charge(state, player, { kind: 'player', id: other.id }, effect.amount, 'card', events);
      return;

    case 'collectEach':
      for (const other of others) charge(state, other, { kind: 'player', id: player.id }, effect.amount, 'card', events);
      return;

    case 'repairs': {
      let total = 0;
      for (const prop of state.props) {
        if (!prop || prop.owner !== player.id) continue;
        total += prop.houses === 5 ? effect.perHotel : prop.houses * effect.perHouse;
      }
      charge(state, player, feeCreditor(state, 'cardFines'), total, 'repairs', events);
      return;
    }
  }
}

function drawCard(state: GameState, player: PlayerState, deck: DeckId, ctx: RentContext, events: GameEvent[]): void {
  const order = state.decks[deck];
  const index = order.shift();
  if (index === undefined) return;

  const card = DECKS[deck].cards[index];
  if (card.effect.type === 'jailCard') player.jailCards.push(deck);
  else order.push(index);

  state.lastCard = { deck, card: index, player: player.id };
  emit(state, events, { type: 'card', player: player.id, detail: `${deck}:${index}` });
  applyCard(state, player, card, ctx, events);
}

function incomeTax(state: GameState, player: PlayerState): number {
  const tax = state.settings.incomeTax;
  return tax.mode === 'percent' ? Math.floor((player.cash * tax.percent) / 100) : tax.amount;
}

export function resolveLanding(state: GameState, player: PlayerState, ctx: RentContext, events: GameEvent[]): void {
  const index = player.position;
  const space = mapOf(state).spaces[index];
  const s = state.settings;

  switch (space.kind) {
    case 'street':
    case 'transit':
    case 'utility': {
      const prop = state.props[index]!;

      if (prop.owner === null) {
        if (s.lapBeforeBuying && player.laps === 0) {
          emit(state, events, { type: 'cannotBuyYet', player: player.id, space: index });
          return;
        }
        state.turn.phase = 'buyDecision';
        state.turn.pendingBuy = index;
        return;
      }

      if (prop.owner === player.id) return;

      const owner = findPlayer(state, prop.owner);
      if (prop.mortgaged) {
        emit(state, events, { type: 'noRentMortgaged', player: player.id, space: index });
        return;
      }
      if (owner.inJail && !s.rentInJail) {
        emit(state, events, { type: 'noRentJail', player: player.id, space: index });
        return;
      }

      charge(state, player, { kind: 'player', id: owner.id }, rentFor(state, index, ctx), 'rent', events);
      return;
    }

    case 'card':
      drawCard(state, player, space.deck, ctx, events);
      return;

    case 'tax': {
      const amount = space.tax.type === 'income' ? incomeTax(state, player) : space.tax.amount;
      charge(state, player, feeCreditor(state, 'taxes'), amount, 'tax', events);
      return;
    }

    case 'goToJail':
      sendToJail(state, player, events);
      return;

    case 'free':
      if (s.jackpot.enabled) {
        if (state.jackpot > 0) {
          player.cash += state.jackpot;
          emit(state, events, { type: 'jackpot', player: player.id, amount: state.jackpot });
        }
        state.jackpot = s.jackpot.seed;
        state.bankNet += s.jackpot.seed;
      }
      return;

    default:
      return;
  }
}
