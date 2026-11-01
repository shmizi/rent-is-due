import type { Action, GameEvent, GameState, SystemAction } from '../types.ts';
import { dropOut, placeBid } from './auction.ts';
import { declareBankruptcy, eliminate } from './bankruptcy.ts';
import { build, mortgage, sellBuilding, unmortgage } from './building.ts';
import { activePlayers, emit, fail, findPlayer, GameError, isActive } from './helpers.ts';
import { settleDebts } from './money.ts';
import { leaders } from './netWorth.ts';
import { disconnect, extendDeadlines, pause, reconnect, restore, resume, syncTimers, tick, voteExtend } from './timers.ts';
import { acceptTrade, cancelTrade, cleanupTrades, counterTrade, declineTrade, proposeTrade } from './trades.ts';
import { buy, decline, endTurn, payJailFine, roll, useJailCard } from './turn.ts';
import { finishGame } from './turnOrder.ts';

const ALLOWED_WHILE_PAUSED = new Set(['resume', 'disconnect', 'reconnect', 'tick', 'restore', 'leave', 'endGame', 'remove', 'extendDeadlines']);

type SystemType = SystemAction['type'];

function runPlayerAction(state: GameState, action: Exclude<Action, { type: SystemType }>, now: number, events: GameEvent[]): void {
  const player = findPlayer(state, action.player);
  if (!isActive(player)) fail('notActive', 'You are out of the game.');
  if (!player.connected) fail('away', 'You are marked as away. Reconnect first.');

  switch (action.type) {
    case 'roll':
      return roll(state, player, events);
    case 'payJailFine':
      return payJailFine(state, player, events);
    case 'useJailCard':
      return useJailCard(state, player, events);
    case 'buy':
      return buy(state, player, events);
    case 'decline':
      return decline(state, player, now, events);
    case 'endTurn':
      return endTurn(state, player, events);
    case 'bid':
      return placeBid(state, player, action.amount, now, events);
    case 'dropOut':
      return dropOut(state, player, now, events);
    case 'build':
      return build(state, player, action.space, events);
    case 'sellBuilding':
      return sellBuilding(state, player, action.space, events);
    case 'mortgage':
      return mortgage(state, player, action.space, events);
    case 'unmortgage':
      return unmortgage(state, player, action.space, events);
    case 'proposeTrade':
      proposeTrade(state, player, action.to, action.give, action.get, now, events);
      return;
    case 'acceptTrade':
      return acceptTrade(state, player, action.trade, events);
    case 'declineTrade':
      return declineTrade(state, player, action.trade, events);
    case 'cancelTrade':
      return cancelTrade(state, player, action.trade, events);
    case 'counterTrade':
      return counterTrade(state, player, action.trade, action.give, action.get, now, events);
    case 'declareBankruptcy':
      return declareBankruptcy(state, player, now, events);
    case 'leave':
      return eliminate(state, player, 'left', now, events);
    case 'voteExtend':
      return voteExtend(state, player, action.target, events);
  }
}

// Mutates state in place. Every handler checks its rules before changing anything,
// so a rejected action throws a GameError and leaves the state as it was.
export function applyAction(state: GameState, action: Action, now: number): GameEvent[] {
  const events: GameEvent[] = [];

  const lifecycle = action.type === 'disconnect' || action.type === 'reconnect' || action.type === 'restore';
  if (state.status !== 'playing' && !lifecycle) fail('gameOver', 'The game is over.');
  if (state.timers.pausedAt !== null && !ALLOWED_WHILE_PAUSED.has(action.type)) fail('paused', 'The game is paused.');

  switch (action.type) {
    case 'tick':
      tick(state, now, events);
      break;
    case 'pause':
      pause(state, now, events);
      break;
    case 'resume':
      resume(state, now, events);
      break;
    case 'restore':
      restore(state, now, events);
      break;
    case 'endGame':
      emit(state, events, { type: 'endedByHost' });
      finishGame(state, leaders(state, activePlayers(state).map((p) => p.id)), events);
      break;
    case 'extendDeadlines':
      extendDeadlines(state, now, action.minMs);
      break;
    case 'remove': {
      const target = findPlayer(state, action.player);
      if (!isActive(target)) fail('notActive', 'That player is already out.');
      emit(state, events, { type: 'removed', player: target.id });
      eliminate(state, target, 'left', now, events);
      break;
    }
    case 'disconnect':
      disconnect(state, findPlayer(state, action.player), now, events);
      break;
    case 'reconnect':
      reconnect(state, findPlayer(state, action.player), events);
      break;
    default:
      runPlayerAction(state, action, now, events);
  }

  if (state.status === 'playing') {
    settleDebts(state, events);
    cleanupTrades(state, events);
  }
  syncTimers(state, now);
  state.version++;

  return events;
}

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; code: string; message: string };

export function applyActionSafe(state: GameState, action: Action, now: number, expectedVersion?: number): ApplyResult {
  if (expectedVersion !== undefined && expectedVersion !== state.version) {
    return { ok: false, code: 'stale', message: 'The game moved on. Try again.' };
  }

  const next = structuredClone(state);
  try {
    const events = applyAction(next, action, now);
    return { ok: true, state: next, events };
  } catch (error) {
    if (error instanceof GameError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
