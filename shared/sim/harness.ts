import { applyAction, applyActionSafe } from '../src/engine/apply.ts';
import { createGame } from '../src/engine/create.ts';
import { GameError, isActive } from '../src/engine/helpers.ts';
import { nextDeadline } from '../src/engine/timers.ts';
import { CLASSIC } from '../src/settings.ts';
import type { Action, GameEvent, GameState, PlayerId, Settings } from '../src/types.ts';
import { botActions, type Rand } from './bot.ts';
import { findViolations } from './invariants.ts';

export interface SimOptions {
  seed: number;
  players: number;
  settings?: Settings;
  maxActions?: number;
  chaos?: boolean;
  checkInvariants?: boolean;
  checkRejections?: boolean;
  safe?: boolean;
  timeActions?: boolean;
}

export interface SimResult {
  seed: number;
  finished: boolean;
  endedByHost: boolean;
  stalled: boolean;
  turns: number;
  rounds: number;
  actions: number;
  rejected: number;
  winners: PlayerId[];
  bankrupt: number;
  left: number;
  timedOut: number;
  stepDefaults: number;
  restores: number;
  auctions: number;
  trades: number;
  actionTimesMs: number[];
  finalState: GameState;
}

export function makeRand(seed: number): Rand {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ['#FF7A59', '#3DA5FF', '#B07CFF', '#9BE15D', '#FFC145', '#FF6FB5', '#4DE1E1', '#F2F2F7'];

function pickActor(state: GameState): PlayerId | null {
  const connected = (id: PlayerId) => state.players.some((p) => p.id === id && p.connected && isActive(p));

  if (state.auction) {
    return state.auction.bidders.find((b) => b !== state.auction!.highBidder && connected(b)) ?? null;
  }

  if (state.debts.length > 0) {
    return state.debts.map((d) => d.debtor).find(connected) ?? null;
  }

  const trade = state.trades.find((t) => connected(t.to));
  if (trade) return trade.to;

  return connected(state.turn.player) ? state.turn.player : null;
}

export function simulateGame(options: SimOptions): SimResult {
  const rand = makeRand(options.seed * 7919 + 13);
  const maxActions = options.maxActions ?? 30000;
  let now = 1_800_000_000_000;

  const settings = structuredClone(options.settings ?? CLASSIC);
  settings.room.maxPlayers = Math.max(settings.room.maxPlayers, options.players);

  let state = createGame({
    mapId: 'harborview',
    settings,
    players: Array.from({ length: options.players }, (_, i) => ({ id: `p${i + 1}`, name: `Bot ${i + 1}`, color: COLORS[i] })),
    seed: options.seed,
    now
  });

  const result: SimResult = {
    seed: options.seed,
    finished: false,
    endedByHost: false,
    stalled: false,
    turns: 0,
    rounds: 0,
    actions: 0,
    rejected: 0,
    winners: [],
    bankrupt: 0,
    left: 0,
    timedOut: 0,
    stepDefaults: 0,
    restores: 0,
    auctions: 0,
    trades: 0,
    actionTimesMs: [],
    finalState: state
  };

  const reconnectAt = new Map<PlayerId, number>();

  const count = (events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'bankrupt') result.bankrupt++;
      if (e.type === 'left') result.left++;
      if (e.type === 'awayTimedOut') result.timedOut++;
      if (e.type === 'timerExpired') result.stepDefaults++;
      if (e.type === 'auctionStarted') result.auctions++;
      if (e.type === 'tradeAccepted') result.trades++;
    }
  };

  const apply = (action: Action): boolean => {
    const before = options.checkRejections ? JSON.stringify(state) : '';
    const started = options.timeActions ? performance.now() : 0;

    if (options.safe) {
      const outcome = applyActionSafe(state, action, now);
      if (options.timeActions) result.actionTimesMs.push(performance.now() - started);
      if (!outcome.ok) {
        result.rejected++;
        return false;
      }
      state = outcome.state;
      count(outcome.events);
    } else {
      try {
        count(applyAction(state, action, now));
        if (options.timeActions) result.actionTimesMs.push(performance.now() - started);
      } catch (error) {
        if (!(error instanceof GameError)) throw error;
        result.rejected++;
        if (options.checkRejections && JSON.stringify(state) !== before) {
          throw new Error(`Rejected ${action.type} (${error.code}) changed the state, seed ${options.seed}`);
        }
        return false;
      }
    }

    result.actions++;
    if (options.checkInvariants) {
      const problems = findViolations(state);
      if (problems.length > 0) {
        throw new Error(`Invariant broken after ${action.type}, seed ${options.seed}, action ${result.actions}: ${problems.join('; ')}`);
      }
    }
    return true;
  };

  for (let step = 0; step < maxActions * 3 && state.status === 'playing' && result.actions < maxActions; step++) {
    now += 1000 + Math.floor(rand() * 2000);

    for (const [id, at] of reconnectAt) {
      if (at <= now) {
        reconnectAt.delete(id);
        apply({ type: 'reconnect', player: id });
      }
    }

    const deadline = nextDeadline(state);
    if (deadline !== null && deadline <= now) apply({ type: 'tick' });
    if (state.status !== 'playing') break;

    if (options.chaos) {
      const active = state.players.filter((p) => isActive(p));
      const online = active.filter((p) => p.connected);
      const roll = rand();

      if (roll < 0.002 && online.length > 0) {
        const victim = online[Math.floor(rand() * online.length)];
        apply({ type: 'disconnect', player: victim.id });
        reconnectAt.set(victim.id, now + 30_000 + Math.floor(rand() * 8 * 60_000));
      } else if (roll < 0.0022 && online.length > 0) {
        apply({ type: 'leave', player: online[Math.floor(rand() * online.length)].id });
      } else if (roll < 0.0025) {
        apply({ type: 'restore' });
        result.restores++;
        for (const p of state.players.filter(isActive)) reconnectAt.set(p.id, now + 1000 + Math.floor(rand() * 40_000));
      } else if (roll < 0.0027 && state.timers.pausedAt === null) {
        apply({ type: 'pause' });
        now += 20_000;
        apply({ type: 'resume' });
      } else if (roll < 0.05) {
        const away = active.find((p) => p.away);
        const voter = online[Math.floor(rand() * online.length)];
        if (away && voter) apply({ type: 'voteExtend', player: voter.id, target: away.id });
      }

      if (state.status !== 'playing') break;
    }

    const actor = pickActor(state);
    let acted = false;

    if (actor && rand() < 0.01) {
      const deadline = nextDeadline(state);
      if (deadline !== null && rand() < 0.5) now = Math.max(now, deadline);
      continue;
    }

    if (actor) {
      for (const action of botActions(state, actor, rand)) {
        if (apply(action)) {
          acted = true;
          break;
        }
      }
    }

    if (!acted) {
      const waits = [nextDeadline(state), ...reconnectAt.values()].filter((t): t is number => t !== null);
      if (waits.length === 0) {
        result.stalled = true;
        break;
      }
      now = Math.max(now, Math.min(...waits));
    }
  }

  result.finished = state.status === 'finished';

  if (!result.finished && !result.stalled) {
    apply({ type: 'endGame' });
    result.endedByHost = true;
  }

  result.turns = state.turn.number;
  result.rounds = state.round;
  result.winners = state.winners;
  result.finalState = state;
  return result;
}
