import type { GameEvent, GameState, PlayerState } from '../types.ts';
import { finishAuction, removeBidder } from './auction.ts';
import { eliminate } from './bankruptcy.ts';
import { emit, fail, findPlayer, isActive } from './helpers.ts';
import { settleDebts } from './money.ts';
import { cleanupTrades } from './trades.ts';
import { decline, endTurn, roll } from './turn.ts';

const EXTENSION_MS = 5 * 60 * 1000;
const RESTORE_GRACE_MS = 30 * 1000;

function stepKey(state: GameState): string {
  return `${state.turn.number}:${state.turn.rolls}:${state.turn.phase}`;
}

function currentPlayerAway(state: GameState): boolean {
  const current = state.players.find((p) => p.id === state.turn.player);
  return !current || !current.connected;
}

export function syncTimers(state: GameState, now: number): void {
  const seconds = state.settings.room.stepTimerSec;
  if (seconds === null || state.status !== 'playing') {
    state.timers.step = null;
    return;
  }

  const key = stepKey(state);
  let timer = state.timers.step;
  if (!timer || timer.key !== key) {
    timer = { key, remaining: seconds * 1000, deadline: null };
    state.timers.step = timer;
  }

  const shouldRun = state.timers.pausedAt === null && !state.auction && state.debts.length === 0 && !currentPlayerAway(state);

  if (shouldRun && timer.deadline === null) timer.deadline = now + timer.remaining;
  if (!shouldRun && timer.deadline !== null) {
    timer.remaining = Math.max(0, timer.deadline - now);
    timer.deadline = null;
  }
}

function runStepDefault(state: GameState, now: number, events: GameEvent[]): void {
  const player = findPlayer(state, state.turn.player);
  emit(state, events, { type: 'timerExpired', player: player.id, detail: state.turn.phase });

  if (state.turn.phase === 'preRoll') roll(state, player, events);
  else if (state.turn.phase === 'buyDecision') decline(state, player, now, events);
  else if (state.turn.canRollAgain) roll(state, player, events);
  else endTurn(state, player, events);
}

export function tick(state: GameState, now: number, events: GameEvent[]): void {
  if (state.status !== 'playing' || state.timers.pausedAt !== null) return;

  for (let guard = 0; guard < 20; guard++) {
    let acted = false;

    for (const player of state.players) {
      if (state.status !== 'playing') return;
      if (isActive(player) && player.away && player.away.deadline <= now) {
        emit(state, events, { type: 'awayTimedOut', player: player.id });
        eliminate(state, player, 'left', now, events);
        acted = true;
      }
    }

    if (state.status !== 'playing') return;

    if (state.auction && state.auction.deadline <= now) {
      finishAuction(state, now, events);
      acted = true;
    }

    settleDebts(state, events);
    syncTimers(state, now);

    const step = state.timers.step;
    if (step && step.deadline !== null && step.deadline <= now) {
      runStepDefault(state, now, events);
      acted = true;
    }

    settleDebts(state, events);
    cleanupTrades(state, events);
    syncTimers(state, now);

    if (!acted) return;
  }
}

export function disconnect(state: GameState, player: PlayerState, now: number, events: GameEvent[]): void {
  if (!player.connected) return;

  player.connected = false;
  if (isActive(player)) {
    player.away = { deadline: now + state.settings.room.awayTimeoutMin * 60 * 1000, votes: [], extensions: 0 };
    if (state.auction && state.auction.highBidder !== player.id) removeBidder(state, player.id, now, events);
  }

  emit(state, events, { type: 'disconnected', player: player.id });
}

export function reconnect(state: GameState, player: PlayerState, events: GameEvent[]): void {
  if (player.connected) return;

  player.connected = true;
  player.away = null;
  emit(state, events, { type: 'reconnected', player: player.id });
}

export function voteExtend(state: GameState, voter: PlayerState, targetId: string, events: GameEvent[]): void {
  const target = findPlayer(state, targetId);
  if (target.id === voter.id) fail('selfVote', 'You cannot vote for yourself.');
  if (!isActive(target) || !target.away) fail('notAway', 'That player is not away.');
  if (target.away.votes.includes(voter.id)) fail('alreadyVoted', 'You already voted.');

  target.away.votes.push(voter.id);
  const voters = state.players.filter((p) => isActive(p) && p.connected && p.id !== target.id).length;
  const needed = Math.floor(voters / 2) + 1;
  emit(state, events, { type: 'voted', player: voter.id, target: target.id, amount: needed });

  if (target.away.votes.length >= needed) {
    target.away.deadline += EXTENSION_MS;
    target.away.votes = [];
    target.away.extensions++;
    emit(state, events, { type: 'awayExtended', player: target.id, amount: target.away.deadline });
  }
}

export function pause(state: GameState, now: number, events: GameEvent[]): void {
  if (state.timers.pausedAt !== null) fail('alreadyPaused', 'The game is already paused.');

  state.timers.pausedAt = now;
  emit(state, events, { type: 'paused' });
}

export function resume(state: GameState, now: number, events: GameEvent[]): void {
  const pausedAt = state.timers.pausedAt;
  if (pausedAt === null) fail('notPaused', 'The game is not paused.');

  const shift = Math.max(0, now - pausedAt);
  if (state.auction) state.auction.deadline += shift;
  for (const player of state.players) {
    if (player.away) player.away.deadline += shift;
  }

  state.timers.pausedAt = null;
  emit(state, events, { type: 'resumed' });
}

export function restore(state: GameState, now: number, events: GameEvent[]): void {
  const graceEnd = now + RESTORE_GRACE_MS;

  if (state.auction && state.auction.deadline < graceEnd) state.auction.deadline = graceEnd;
  const step = state.timers.step;
  if (step) {
    if (step.deadline !== null) step.remaining = Math.max(step.deadline - now, RESTORE_GRACE_MS);
    else step.remaining = Math.max(step.remaining, RESTORE_GRACE_MS);
    step.deadline = null;
  }

  for (const player of state.players) {
    player.connected = false;
    player.away = isActive(player) ? { deadline: now + state.settings.room.awayTimeoutMin * 60 * 1000, votes: [], extensions: 0 } : null;
  }

  emit(state, events, { type: 'restored' });
}

export function nextDeadline(state: GameState): number | null {
  if (state.status !== 'playing' || state.timers.pausedAt !== null) return null;

  const deadlines: number[] = [];
  for (const player of state.players) {
    if (isActive(player) && player.away) deadlines.push(player.away.deadline);
  }
  if (state.auction) deadlines.push(state.auction.deadline);
  if (state.timers.step?.deadline != null) deadlines.push(state.timers.step.deadline);

  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}
