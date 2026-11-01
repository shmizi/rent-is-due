import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { botActions } from '../shared/sim/bot.ts';
import { makeRand, pickActor } from '../shared/sim/harness.ts';
import { findViolations } from '../shared/sim/invariants.ts';
import type { ClientAction, ClientMessage, ServerMessage } from '../shared/src/protocol.ts';
import { CLASSIC } from '../shared/src/settings.ts';
import { applyPatch } from '../shared/src/sync.ts';
import type { GameState } from '../shared/src/types.ts';
import { gameView, type GameView } from '../shared/src/view.ts';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const PERSIST = '.wrangler/e2e';
const rand = makeRand(Number(process.argv[2] ?? 7));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v
  );
}

let server: ChildProcess | null = null;

async function startServer(): Promise<number> {
  const started = Date.now();
  server = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--var', 'DEV:true', '--persist-to', PERSIST], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout!.on('data', () => {});
  server.stderr!.on('data', (d) => {
    const text = String(d);
    if (/error/i.test(text) && !/ExperimentalWarning/.test(text)) process.stderr.write(text);
  });

  for (let i = 0; i < 200; i++) {
    try {
      const res = await fetch(`${BASE}/api/rooms/AAAAAA`);
      if (res.ok) return Date.now() - started;
    } catch {
      await sleep(300);
    }
  }
  throw new Error('wrangler dev did not start');
}

async function stopServer(): Promise<void> {
  if (!server) return;
  if (process.platform === 'win32') execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
  else server.kill('SIGKILL');
  server = null;

  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/rooms/AAAAAA`);
      await sleep(200);
    } catch {
      return;
    }
  }
}

class Client {
  name: string;
  ws: WebSocket | null = null;
  token: string | undefined;
  id = '';
  role = '';
  view: GameView | null = null;
  version = 0;
  waiting = new Map<string, (m: ServerMessage | null) => void>();
  open = false;
  outOfSync = 0;

  constructor(name: string) {
    this.name = name;
  }

  connect(code: string, spectate = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/${code}`);
      this.ws = ws;
      ws.onopen = () => {
        this.open = true;
        const hello: ClientMessage = this.token ? { t: 'hello', token: this.token } : { t: 'hello', name: this.name, spectate };
        ws.send(JSON.stringify(hello));
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.t === 'welcome') {
          this.id = message.you.id;
          this.role = message.you.role;
          if (message.you.token) this.token = message.you.token;
          this.view = message.game;
          this.version = message.version;
          resolve();
        } else if (message.t === 'game') {
          this.view = message.game;
          this.version = message.version;
        } else if (message.t === 'patch') {
          if (message.from !== this.version) {
            this.outOfSync++;
            ws.send(JSON.stringify({ t: 'sync' }));
          } else {
            this.view = applyPatch(this.view, message.ops);
            this.version = message.to;
          }
          for (const [id, done] of this.waiting) {
            this.waiting.delete(id);
            done(message);
          }
        } else if (message.t === 'reject') {
          if (message.id && this.waiting.has(message.id)) {
            this.waiting.get(message.id)!(message);
            this.waiting.delete(message.id);
          } else if (!this.view && message.code === 'badToken') {
            reject(new Error(`${this.name}: ${message.message}`));
          }
        }
      };
      ws.onclose = () => {
        this.open = false;
        for (const [id, done] of this.waiting) {
          this.waiting.delete(id);
          done(null);
        }
      };
      ws.onerror = () => reject(new Error(`${this.name} could not connect`));
    });
  }

  send(message: ClientMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  request(message: ClientMessage & { id: string }): Promise<ServerMessage | null> {
    return new Promise((resolve) => {
      this.waiting.set(message.id, resolve);
      this.send(message);
      setTimeout(() => {
        if (this.waiting.delete(message.id)) resolve(null);
      }, 3000);
    });
  }

  drop(): void {
    this.ws?.close();
    this.open = false;
  }
}

async function debug(code: string) {
  const res = await fetch(`${BASE}/api/rooms/${code}/debug`);
  return (await res.json()) as { meta: { phase: string; stats: Record<string, number> }; game: GameState };
}

function stripVolatile(game: GameState) {
  return {
    ...game,
    version: null,
    timers: null,
    auction: game.auction ? { ...game.auction, deadline: null } : null,
    players: game.players.map((p) => ({ ...p, away: null, connected: null }))
  };
}

async function main() {
  rmSync(PERSIST, { recursive: true, force: true });
  const report: string[] = [];
  const firstBoot = await startServer();
  report.push(`wrangler dev started in ${(firstBoot / 1000).toFixed(1)} s`);

  const page = await fetch(`${BASE}/`);
  report.push(`GET / -> ${page.status} ${page.headers.get('content-type')}`);
  report.push(`GET /api/nope -> ${(await fetch(`${BASE}/api/nope`)).status}`);

  const created = await fetch(`${BASE}/api/rooms`, { method: 'POST' });
  const { code } = (await created.json()) as { code: string };
  report.push(`POST /api/rooms -> ${created.status}, room ${code}`);

  const players = ['Sam', 'Priya', 'Leo', 'Mei', 'Jo', 'Ava'].map((n) => new Client(n));
  for (const p of players) await p.connect(code);
  const watcher = new Client('Watcher');
  await watcher.connect(code, true);
  const info = await (await fetch(`${BASE}/api/rooms/${code}`)).json();
  report.push(`GET /api/rooms/${code} -> ${JSON.stringify(info)}`);

  const host = players[0];
  const settings = structuredClone(CLASSIC);
  settings.startingCash = 900;
  await host.request({ t: 'lobby', id: 'settings', op: { op: 'settings', settings } });
  host.send({ t: 'lobby', id: 'start', op: { op: 'start' } });
  for (let i = 0; i < 50 && !host.view; i++) await sleep(50);
  if (!host.view) throw new Error('The game did not start');

  const startedAt = Date.now();
  const restarts: string[] = [];
  let steps = 0;
  let drops = 0;
  let mirrorChecks = 0;
  let id = 0;
  const backAt = new Map<Client, number>();

  const probe = players.find((p) => p.id !== host.view!.turn.player && p !== host)!;
  const probeDroppedAt = Date.now();
  let probeResult = 'not checked';
  probe.drop();

  const restart = async (reason: string) => {
    const before = (await debug(code)).game;
    for (const c of [...players, watcher]) c.open = false;
    await stopServer();
    const boot = await startServer();
    const after = (await debug(code)).game;
    const same = canonical(stripVolatile(after)) === canonical(stripVolatile(before));
    const deadline = after.auction ? Math.round((after.auction.deadline - Date.now()) / 1000) : null;
    restarts.push(`${reason}: back in ${(boot / 1000).toFixed(1)} s, state ${same ? 'identical' : 'DIFFERENT'}, version ${before.version} -> ${after.version}${deadline !== null ? `, auction clock ${deadline} s` : ''}`);
    if (!same) throw new Error(`State changed across the ${reason} restart`);

    for (const c of [...players, watcher]) {
      if (c === probe && probeResult === 'not checked') continue;
      await c.connect(code);
    }
  };

  while (steps < 20000) {
    steps++;
    const state = await debug(code);
    const game = state.game;
    if (game.status !== 'playing') break;

    const problems = findViolations(game);
    if (problems.length > 0) throw new Error(`Invariant broken at step ${steps}: ${problems.join('; ')}`);

    if (probeResult === 'not checked' && Date.now() - probeDroppedAt > 18_000) {
      const seen = game.players.find((p) => p.id === probe.id)!;
      probeResult = !seen.connected && seen.away
        ? `marked away by the grace alarm after ${((Date.now() - probeDroppedAt) / 1000).toFixed(0)} s, away clock ${Math.round((seen.away.deadline - Date.now()) / 1000)} s`
        : `NOT marked away (connected=${seen.connected})`;
      await probe.connect(code);
    }

    if (steps % 25 === 0) {
      await sleep(30);
      const fresh = (await debug(code)).game;
      for (const c of [...players, watcher].filter((x) => x.open)) {
        const viewer = c.role === 'player' ? c.id : null;
        if (c.version === fresh.version && canonical(c.view) !== canonical(gameView(fresh, viewer))) throw new Error(`${c.name} is out of sync`);
      }
      mirrorChecks++;
    }

    if (!restarts.some((r) => r.startsWith('mid-auction')) && game.auction) {
      await restart('mid-auction');
      continue;
    }
    if (!restarts.some((r) => r.startsWith('mid-debt')) && game.debts.length > 0) {
      await restart('mid-debt');
      continue;
    }

    for (const [client, at] of backAt) {
      if (Date.now() >= at) {
        backAt.delete(client);
        await client.connect(code);
      }
    }

    if (rand() < 0.004) {
      const online = players.filter((p) => p.open && !backAt.has(p) && p !== probe);
      const victim = online[Math.floor(rand() * online.length)];
      if (victim) {
        victim.drop();
        backAt.set(victim, Date.now() + 1000 + Math.floor(rand() * 10_000));
        drops++;
      }
    }

    const actor = players.find((p) => p.id === pickActor(game) && p.open);
    if (!actor || !actor.view) {
      await sleep(100);
      continue;
    }

    for (const action of botActions(actor.view as unknown as GameState, actor.id, rand)) {
      const { player: _player, ...rest } = action as { player: string };
      const reply = await actor.request({ t: 'action', id: `m${++id}`, action: rest as ClientAction, expectedVersion: actor.version });
      if (reply && reply.t !== 'reject') break;
    }
  }

  let final = await debug(code);
  const finishedOnItsOwn = final.game.status === 'finished';
  if (!finishedOnItsOwn) {
    await host.request({ t: 'lobby', id: 'end', op: { op: 'endGame' } });
    final = await debug(code);
  }

  const stats = final.meta.stats;
  const minutes = (Date.now() - startedAt) / 60000;
  const connects = 7 + drops + restarts.length * 7;
  const billedRequests = connects + Math.ceil(stats.messages / 20) + stats.alarms;

  report.push(`Game: ${finishedOnItsOwn ? 'finished on its own' : 'ended by the host'} after ${final.game.turn.number} turns, ${final.game.round} rounds, ${steps} steps, ${minutes.toFixed(1)} min wall clock`);
  report.push(`Restarts: ${restarts.join(' | ')}`);
  report.push(`Alarm probe (one player dropped for 18 s): ${probeResult}`);
  report.push(`Random drops and reconnects: ${drops}. Mirror checks passed: ${mirrorChecks}. Out-of-order patches recovered by sync: ${players.reduce((s, p) => s + p.outOfSync, 0)}`);
  report.push(`Final invariants: ${findViolations(final.game).length === 0 ? 'all hold' : findViolations(final.game).join('; ')}`);
  report.push(`Usage for this game: ${stats.actions} engine actions, ${stats.messages} incoming messages, ${stats.alarms} alarms, ${stats.rowsWritten} rows written`);
  report.push(`Estimated Durable Object requests (sockets + messages/20 + alarms): ${billedRequests}, which is ${((billedRequests / 100000) * 100).toFixed(1)}% of the free daily 100,000`);
  report.push(`Rows written: ${((stats.rowsWritten / 100000) * 100).toFixed(1)}% of the free daily 100,000`);

  for (const c of [...players, watcher]) c.drop();
  await stopServer();
  console.log(report.join('\n'));
}

main().catch(async (error) => {
  console.error(error);
  await stopServer();
  process.exit(1);
});
