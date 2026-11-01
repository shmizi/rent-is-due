import { botActions } from '../../shared/sim/bot.ts';
import { makeRand, pickActor } from '../../shared/sim/harness.ts';
import { findViolations } from '../../shared/sim/invariants.ts';
import type { ClientAction } from '../../shared/src/protocol.ts';
import type { GameState, Settings } from '../../shared/src/types.ts';
import { gameView } from '../../shared/src/view.ts';
import { canonical, TestRoom, type FakeConn } from './fakeRoom.ts';

export interface RoomGameOptions {
  seed: number;
  players: number;
  settings: Settings;
  chaos?: boolean;
  restarts?: boolean;
  checkMirrors?: boolean;
  maxSteps?: number;
}

export interface RoomGameResult {
  finished: boolean;
  endedByHost: boolean;
  steps: number;
  turns: number;
  restarts: { auction: boolean; debt: boolean };
  drops: number;
  stats: { messages: number; alarms: number; actions: number; rowsWritten: number };
}

interface Seat {
  name: string;
  id: string;
  token: string;
  conn: FakeConn;
  away: boolean;
  backAt: number;
}

function stripVolatile(game: GameState): unknown {
  return {
    ...game,
    version: null,
    timers: null,
    auction: game.auction ? { ...game.auction, deadline: null } : null,
    players: game.players.map((p) => ({ ...p, away: null }))
  };
}

export async function playRoomGame(options: RoomGameOptions): Promise<RoomGameResult> {
  const rand = makeRand(options.seed);
  const maxSteps = options.maxSteps ?? 40000;
  let room = TestRoom.create(options.seed);
  const seats: Seat[] = [];

  const names = ['Sam', 'Priya', 'Leo', 'Mei', 'Jo', 'Ava', 'Noor', 'Kai'];
  for (const name of names.slice(0, options.players)) {
    const conn = await room.join(name);
    const welcome = conn.last('welcome')!;
    seats.push({ name, id: welcome.you.id, token: welcome.you.token!, conn, away: false, backAt: 0 });
  }

  const watcherConn = await room.join('Watcher', true);
  const watcher = { token: watcherConn.last('welcome')!.you.token!, conn: watcherConn };

  const host = seats[0].conn;
  await host.say({ t: 'lobby', id: 'settings', op: { op: 'settings', settings: options.settings } });
  await host.say({ t: 'lobby', id: 'start', op: { op: 'start' } });
  if (room.state().meta!.phase !== 'playing') throw new Error(`Game did not start: ${JSON.stringify(host.last('reject'))}`);

  const result: RoomGameResult = {
    finished: false,
    endedByHost: false,
    steps: 0,
    turns: 0,
    restarts: { auction: false, debt: false },
    drops: 0,
    stats: { messages: 0, alarms: 0, actions: 0, rowsWritten: 0 }
  };

  const restart = async () => {
    const before = room.state().game!;
    room = room.restart();
    const after = room.state().game!;
    if (canonical(stripVolatile(after)) !== canonical(stripVolatile(before))) throw new Error(`State changed across a restart, seed ${options.seed}`);

    for (const seat of seats) {
      seat.away = true;
      seat.backAt = room.now + 1000 + Math.floor(rand() * 9000);
    }
    watcher.conn = await room.rejoin(watcher.token);
  };

  let messageId = 0;

  for (; result.steps < maxSteps && room.state().meta!.phase === 'playing'; result.steps++) {
    room.advance(1000 + Math.floor(rand() * 2000));

    for (const seat of seats) {
      if (seat.away && seat.backAt <= room.now) {
        seat.conn = await room.rejoin(seat.token);
        seat.away = seat.conn.last('reject')?.code === 'badToken';
      }
    }

    if (options.chaos && rand() < 0.003) {
      const online = seats.filter((s) => !s.away);
      const victim = online[Math.floor(rand() * online.length)];
      if (victim) {
        victim.conn.drop();
        victim.away = true;
        victim.backAt = room.now + 5000 + Math.floor(rand() * 8 * 60_000);
        result.drops++;
      }
    }

    const game = room.state().game!;
    if (game.status !== 'playing') break;

    if (options.restarts && !result.restarts.auction && game.auction) {
      await restart();
      result.restarts.auction = true;
      continue;
    }
    if (options.restarts && !result.restarts.debt && game.debts.length > 0) {
      await restart();
      result.restarts.debt = true;
      continue;
    }

    const actorId = pickActor(game);
    const seat = seats.find((s) => s.id === actorId && !s.away);

    if (seat && seat.conn.view && rand() > 0.02) {
      for (const action of botActions(seat.conn.view as unknown as GameState, seat.id, rand)) {
        const { player: _player, ...rest } = action as { player: string };
        const id = `m${++messageId}`;
        await seat.conn.say({ t: 'action', id, action: rest as ClientAction, expectedVersion: seat.conn.version });
        if (seat.conn.last('reject')?.id !== id) break;
      }
    }

    const now = room.state().game!;
    const problems = findViolations(now);
    if (problems.length > 0) throw new Error(`Invariant broken in room game, seed ${options.seed}, step ${result.steps}: ${problems.join('; ')}`);

    if (options.checkMirrors) {
      for (const s of seats.filter((x) => !x.away)) {
        if (canonical(s.conn.view) !== canonical(gameView(now, s.id))) throw new Error(`${s.name} is out of sync at step ${result.steps}, seed ${options.seed}`);
      }
      if (canonical(watcher.conn.view) !== canonical(gameView(now, null))) throw new Error(`The spectator is out of sync at step ${result.steps}`);
    }
  }

  result.finished = room.state().game!.status === 'finished';
  if (!result.finished) {
    await host.say({ t: 'lobby', id: 'end', op: { op: 'endGame' } });
    result.endedByHost = room.state().game!.status === 'finished';
  }

  const state = room.state();
  result.turns = state.game!.turn.number;
  result.stats = state.meta!.stats;
  return result;
}
