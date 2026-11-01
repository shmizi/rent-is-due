import type { GameEvent, GameState, PlayerId } from '../types.ts';
import { activePlayers, emit, isActive } from './helpers.ts';
import { leaders, netWorth } from './netWorth.ts';

export function finishGame(state: GameState, winners: PlayerId[], events: GameEvent[]): void {
  state.status = 'finished';
  state.winners = winners;
  state.auction = null;
  state.auctionQueue = [];
  state.timers.step = null;
  emit(state, events, { type: 'gameOver', detail: winners.join(',') });
}

export function checkLastStanding(state: GameState, events: GameEvent[]): boolean {
  const active = activePlayers(state);
  if (active.length > 1) return false;

  finishGame(state, active.map((p) => p.id), events);
  return true;
}

export function advanceTurn(state: GameState, events: GameEvent[]): void {
  const previous = state.turn.player;

  if (state.settings.tradeOnlyOwnTurn) {
    const closing = state.trades.filter((t) => t.from === previous);
    state.trades = state.trades.filter((t) => t.from !== previous);
    for (const trade of closing) emit(state, events, { type: 'tradeCancelled', player: trade.from, target: trade.to, detail: 'turnEnded' });
  }

  const players = state.players;
  const n = players.length;
  const start = players.findIndex((p) => p.id === previous);
  let wrapped = false;
  let next = null;

  for (let k = 1; k <= n; k++) {
    if (start + k >= n) wrapped = true;
    const candidate = players[(start + k) % n];
    if (isActive(candidate)) {
      next = candidate;
      break;
    }
  }

  if (!next) return;
  if (wrapped) state.round++;

  const win = state.settings.win;
  const active = activePlayers(state).map((p) => p.id);
  const calm = !state.auction && state.debts.length === 0;

  if (win.mode === 'rounds' && wrapped && state.round > win.rounds) {
    finishGame(state, leaders(state, active), events);
    return;
  }

  if (win.mode === 'netWorth' && calm) {
    const over = active.filter((id) => netWorth(state, id) >= win.target);
    if (over.length > 0) {
      finishGame(state, leaders(state, over), events);
      return;
    }
  }

  state.turn = {
    player: next.id,
    phase: 'preRoll',
    doubles: 0,
    rolls: 0,
    canRollAgain: false,
    lastRoll: null,
    pendingBuy: null,
    number: state.turn.number + 1
  };

  emit(state, events, { type: 'turnStarted', player: next.id, amount: state.round });
}
