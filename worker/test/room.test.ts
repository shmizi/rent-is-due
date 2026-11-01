import { describe, expect, it } from 'vitest';
import { CLASSIC } from '../../shared/src/settings.ts';
import type { ClientAction } from '../../shared/src/protocol.ts';
import { gameView } from '../../shared/src/view.ts';
import { canonical, TestRoom, type FakeConn } from './fakeRoom.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

async function lobby(names: string[]) {
  const room = TestRoom.create();
  const conns: FakeConn[] = [];
  for (const name of names) conns.push(await room.join(name));
  return { room, conns };
}

async function started(names: string[]) {
  const { room, conns } = await lobby(names);
  await conns[0].say({ t: 'lobby', id: 'start', op: { op: 'start' } });
  return { room, conns };
}

function currentConn(room: TestRoom, conns: FakeConn[]): FakeConn {
  const current = room.state().game!.turn.player;
  return conns.find((c) => c.you?.id === current)!;
}

async function send(conn: FakeConn, action: ClientAction, id = 'a1', expectedVersion?: number) {
  await conn.say({ t: 'action', id, action, expectedVersion });
}

function expectMirrorsMatch(room: TestRoom, conns: FakeConn[]): void {
  const game = room.state().game!;
  for (const conn of conns.filter((c) => c.open)) {
    const viewer = conn.you!.role === 'player' ? conn.you!.id : null;
    expect(canonical(conn.view)).toBe(canonical(gameView(game, viewer)));
  }
}

describe('joining', () => {
  it('makes the first player the host and gives everyone a colour and a token', async () => {
    const { room, conns } = await lobby(['Sam', 'Priya']);
    const welcome = conns[0].last('welcome')!;

    expect(welcome.you.token).toMatch(/^[0-9a-f]{64}$/);
    expect(conns[1].room!.members.map((m) => [m.name, m.host, m.role])).toEqual([
      ['Sam', true, 'player'],
      ['Priya', false, 'player']
    ]);
    expect(new Set(conns[1].room!.members.map((m) => m.color)).size).toBe(2);
    expect(room.core.info()).toMatchObject({ exists: true, phase: 'lobby', players: 2, seats: 6 });
  });

  it('lets a player come back with their token', async () => {
    const { room, conns } = await lobby(['Sam', 'Priya']);
    const token = conns[1].last('welcome')!.you.token!;
    conns[1].drop();

    const back = await room.rejoin(token);
    expect(back.last('welcome')!.you).toEqual({ id: conns[1].you!.id, role: 'player' });
  });

  it('rejects an unknown token and a bad name', async () => {
    const room = TestRoom.create();
    const stranger = await room.rejoin('nope');
    expect(stranger.last('reject')!.code).toBe('badToken');

    const blank = await room.join('   ');
    expect(blank.last('reject')!.code).toBe('badName');
  });

  it('seats extra people as spectators, or turns them away with spectators off', async () => {
    const { room, conns } = await lobby(['A', 'B']);
    const settings = structuredClone(CLASSIC);
    settings.room.maxPlayers = 2;
    await conns[0].say({ t: 'lobby', id: 's', op: { op: 'settings', settings } });

    const third = await room.join('C');
    expect(third.last('welcome')!.you.role).toBe('spectator');

    settings.room.spectators = false;
    await conns[0].say({ t: 'lobby', id: 's2', op: { op: 'settings', settings } });
    const fourth = await room.join('D');
    expect(fourth.last('reject')!.code).toBe('roomFull');
  });

  it('refuses to open a socket for a room that was never created', async () => {
    const room = new TestRoom();
    expect(room.core.info()).toEqual({ exists: false });
    const conn = room.connect();
    await conn.say({ t: 'hello', name: 'Sam' });
    expect(conn.last('reject')!.code).toBe('noRoom');
  });
});

describe('lobby', () => {
  it('lets only the host change settings, and applies the restrictions', async () => {
    const { conns } = await lobby(['Sam', 'Priya']);
    const settings = { ...structuredClone(CLASSIC), rollAgainOnDoubles: false };

    await conns[1].say({ t: 'lobby', id: 'x', op: { op: 'settings', settings } });
    expect(conns[1].last('reject')!.code).toBe('notHost');

    await conns[0].say({ t: 'lobby', id: 'y', op: { op: 'settings', settings } });
    const room = conns[1].room!;
    expect(room.settings.threeDoublesJail).toBe(false);
    expect(room.preset).toBe('custom');
    expect(room.notes.length).toBe(1);
  });

  it('switches presets', async () => {
    const { conns } = await lobby(['Sam', 'Priya']);
    await conns[0].say({ t: 'lobby', id: 'p', op: { op: 'preset', preset: 'quick' } });
    expect(conns[1].room!.preset).toBe('quick');
    expect(conns[1].room!.settings.win).toEqual({ mode: 'rounds', rounds: 20 });
  });

  it('refuses a colour someone already has', async () => {
    const { conns } = await lobby(['Sam', 'Priya']);
    const samColor = conns[0].room!.members[0].color;
    await conns[1].say({ t: 'lobby', id: 'c', op: { op: 'appearance', color: samColor } });
    expect(conns[1].last('reject')!.code).toBe('colorTaken');

    await conns[1].say({ t: 'lobby', id: 'c2', op: { op: 'appearance', color: '#FFC145', shape: 'hex', name: 'Pri' } });
    expect(conns[0].room!.members[1]).toMatchObject({ name: 'Pri', color: '#FFC145', shape: 'hex' });
  });

  it('needs two players to start', async () => {
    const { conns } = await lobby(['Sam']);
    await conns[0].say({ t: 'lobby', id: 'go', op: { op: 'start' } });
    expect(conns[0].last('reject')!.code).toBe('notEnoughPlayers');
  });
});

describe('playing', () => {
  it('sends everyone their own view, and keeps it in sync with patches', async () => {
    const { room, conns } = await started(['Sam', 'Priya', 'Leo']);
    const watcher = await room.join('Jo');
    const everyone = [...conns, watcher];
    expectMirrorsMatch(room, everyone);

    await send(currentConn(room, conns), { type: 'roll' });
    expectMirrorsMatch(room, everyone);
    expect(watcher.last('patch')!.ops.length).toBeGreaterThan(0);
  });

  it('rejects moves out of turn, stale moves and spectator moves', async () => {
    const { room, conns } = await started(['Sam', 'Priya']);
    const current = currentConn(room, conns);
    const other = conns.find((c) => c !== current)!;

    await send(other, { type: 'roll' }, 'r1');
    expect(other.last('reject')).toMatchObject({ id: 'r1', code: 'notYourTurn' });

    await send(current, { type: 'roll' }, 'r2', 99);
    expect(current.last('reject')).toMatchObject({ id: 'r2', code: 'stale' });

    const watcher = await room.join('Jo');
    await send(watcher, { type: 'roll' }, 'r3');
    expect(watcher.last('reject')).toMatchObject({ id: 'r3', code: 'spectator' });
  });

  it('survives junk from a client', async () => {
    const { room, conns } = await started(['Sam', 'Priya']);
    const current = currentConn(room, conns);
    const other = conns.find((c) => c !== current)!;

    await room.core.onMessage(current, 'not json');
    await room.core.onMessage(current, JSON.stringify({ t: 'action', id: 'j', action: { type: 'tick' } }));
    await room.core.onMessage(current, JSON.stringify({ t: 'action', id: 'k', action: { type: 'proposeTrade', to: other.you!.id } }));

    expect(current.messages.filter((m) => m.t === 'reject').map((m) => (m as { code: string }).code)).toEqual(['badMessage', 'badAction', 'badAction']);
    expect(room.state().game!.version).toBe(0);
  });

  it('lets a connection join only once', async () => {
    const { room, conns } = await lobby(['Sam']);
    for (let i = 0; i < 5; i++) await conns[0].say({ t: 'hello', name: `Fake ${i}` });

    expect(conns[0].last('reject')!.code).toBe('alreadyJoined');
    expect(room.state().members).toHaveLength(1);
  });

  it('limits how fast new people can join', async () => {
    const room = TestRoom.create();
    const joined: FakeConn[] = [];
    for (let i = 0; i < 14; i++) joined.push(await room.join(`P${i}`, true));

    expect(room.state().members).toHaveLength(12);
    expect(joined[13].last('reject')!.code).toBe('rateLimited');
    expect(joined[13].open).toBe(false);

    room.advance(MINUTE + SECOND);
    const later = await room.join('Late', true);
    expect(later.last('welcome')).toBeDefined();
  });

  it('limits how fast one person can send messages', async () => {
    const { conns } = await started(['Sam', 'Priya']);
    for (let i = 0; i < 26; i++) await conns[0].say({ t: 'sync' });
    expect(conns[0].last('reject')!.code).toBe('rateLimited');
  });
});

describe('connections', () => {
  it('waits 15 seconds before marking a dropped player away, then clears it on return', async () => {
    const { room, conns } = await started(['Sam', 'Priya', 'Leo']);
    const current = currentConn(room, conns);
    const token = current.last('welcome')!.you.token!;
    const id = current.you!.id;
    current.drop();

    room.advance(14 * SECOND);
    expect(room.state().game!.players.find((p) => p.id === id)!.connected).toBe(true);

    room.advance(2 * SECOND);
    expect(room.state().game!.players.find((p) => p.id === id)!.away).not.toBeNull();

    await room.rejoin(token);
    const player = room.state().game!.players.find((p) => p.id === id)!;
    expect(player.connected).toBe(true);
    expect(player.away).toBeNull();
  });

  it('removes a player who stays away past the timeout', async () => {
    const { room, conns } = await started(['Sam', 'Priya', 'Leo']);
    const current = currentConn(room, conns);
    const quitter = conns.find((c) => c !== current)!;
    quitter.drop();

    room.advance(15 * SECOND + 5 * MINUTE);
    expect(room.state().game!.players.find((p) => p.id === quitter.you!.id)!.status).toBe('left');
  });

  it('hands the host role on after the host is gone for 2 minutes', async () => {
    const { room, conns } = await started(['Sam', 'Priya', 'Leo']);
    conns[0].drop();

    room.advance(2 * MINUTE + SECOND);
    expect(conns[1].room!.members.find((m) => m.host)!.name).toBe('Priya');
  });

  it('lets the host remove a player mid-game', async () => {
    const { room, conns } = await started(['Sam', 'Priya', 'Leo']);
    await conns[0].say({ t: 'lobby', id: 'k', op: { op: 'kick', player: conns[2].you!.id } });

    expect(conns[2].last('kicked')).toBeDefined();
    expect(conns[2].open).toBe(false);
    expect(room.state().game!.players.find((p) => p.id === conns[2].you!.id)!.status).toBe('left');
  });

  it('closes the room after a day of lobby idling', async () => {
    const { room } = await lobby(['Sam']);
    room.advance(24 * 60 * MINUTE + SECOND);
    expect(room.core.info()).toEqual({ exists: false });
  });
});

describe('restarts', () => {
  it('reloads the game exactly, gives timers at least 30 seconds, and lets everyone back in', async () => {
    const { room, conns } = await started(['Sam', 'Priya', 'Leo']);
    await send(currentConn(room, conns), { type: 'roll' });
    const before = room.state();
    const tokens = conns.map((c) => c.last('welcome')!.you.token!);

    room.advance(5 * SECOND);
    const next = room.restart();
    const after = next.state();

    expect(canonical({ ...after.game!, timers: null, version: null })).toBe(canonical({ ...before.game!, timers: null, version: null }));
    expect(after.meta!.graces).toEqual(Object.fromEntries(before.game!.players.map((p) => [p.id, next.now + 15 * SECOND])));

    const back = [];
    for (const token of tokens) back.push(await next.rejoin(token));
    next.advance(20 * SECOND);

    expect(next.state().game!.players.every((p) => p.connected && p.away === null)).toBe(true);
    expectMirrorsMatch(next, back);
  });

  it('hands the host role on when the host does not come back after a restart', async () => {
    const { room, conns } = await started(['Sam', 'Priya']);
    const priyaToken = conns[1].last('welcome')!.you.token!;

    const next = room.restart();
    const priya = await next.rejoin(priyaToken);
    next.advance(2 * MINUTE + SECOND);

    expect(priya.room!.members.find((m) => m.host)!.name).toBe('Priya');
  });
});

describe('chat', () => {
  it('keeps messages short and follows the spectator chat setting', async () => {
    const { room, conns } = await lobby(['Sam', 'Priya']);
    await conns[1].say({ t: 'chat', text: 'x'.repeat(301) });
    expect(conns[1].last('reject')!.code).toBe('badChat');

    await conns[1].say({ t: 'chat', text: 'hello' });
    expect(conns[0].last('chat')!.message).toMatchObject({ name: 'Priya', text: 'hello' });

    const settings = structuredClone(CLASSIC);
    settings.room.spectatorChat = false;
    await conns[0].say({ t: 'lobby', id: 's', op: { op: 'settings', settings } });
    const watcher = await room.join('Jo', true);
    await watcher.say({ t: 'chat', text: 'hi' });
    expect(watcher.last('reject')!.code).toBe('chatOff');
    expect(watcher.last('welcome')!.chat.map((m) => m.text)).toEqual(['hello']);
  });
});
