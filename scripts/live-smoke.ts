import { botActions } from '../shared/sim/bot.ts';
import { makeRand, pickActor } from '../shared/sim/harness.ts';
import type { ClientAction, ClientMessage, ServerMessage } from '../shared/src/protocol.ts';
import { QUICK } from '../shared/src/settings.ts';
import { applyPatch } from '../shared/src/sync.ts';
import type { GameState } from '../shared/src/types.ts';
import type { GameView } from '../shared/src/view.ts';

const BASE = (process.argv[2] ?? 'https://rent-is-due.property-game.workers.dev').replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');
const MAX_ACTIONS = Number(process.argv[3] ?? 300);
const rand = makeRand(11);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

class Client {
  name: string;
  ws: WebSocket | null = null;
  id = '';
  view: GameView | null = null;
  version = 0;
  waiting = new Map<string, (m: ServerMessage | null) => void>();
  outOfSync = 0;

  constructor(name: string) {
    this.name = name;
  }

  connect(code: string, spectate = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_BASE}/ws/${code}`);
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: this.name, spectate } satisfies ClientMessage));
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.t === 'welcome') {
          this.id = message.you.id;
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
        } else if (message.t === 'reject' && message.id && this.waiting.has(message.id)) {
          this.waiting.get(message.id)!(message);
          this.waiting.delete(message.id);
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
      }, 5000);
    });
  }
}

async function main() {
  const report: string[] = [`Target: ${BASE}`];

  const page = await fetch(`${BASE}/`);
  report.push(`GET / -> ${page.status} ${page.headers.get('content-type')}`);
  const deep = await fetch(`${BASE}/r/ABCDEF`);
  report.push(`GET /r/ABCDEF -> ${deep.status} ${deep.headers.get('content-type')}`);
  report.push(`GET /api/nope -> ${(await fetch(`${BASE}/api/nope`)).status}`);

  const created = await fetch(`${BASE}/api/rooms`, { method: 'POST' });
  const { code } = (await created.json()) as { code: string };
  report.push(`POST /api/rooms -> ${created.status}, room ${code}`);
  report.push(`GET /api/rooms/${code}/debug -> ${(await fetch(`${BASE}/api/rooms/${code}/debug`)).status}`);

  const players = ['Sam', 'Priya', 'Leo', 'Mei'].map((n) => new Client(n));
  const connectTimes: number[] = [];
  for (const p of players) {
    const t = Date.now();
    await p.connect(code);
    connectTimes.push(Date.now() - t);
  }
  const watcher = new Client('Watcher');
  await watcher.connect(code, true);
  report.push(`Joins: ${players.length} players and a spectator, connect + welcome ${Math.min(...connectTimes)}-${Math.max(...connectTimes)} ms`);
  report.push(`GET /api/rooms/${code} -> ${JSON.stringify(await (await fetch(`${BASE}/api/rooms/${code}`)).json())}`);

  const host = players[0];
  await host.request({ t: 'lobby', id: 'settings', op: { op: 'settings', settings: structuredClone(QUICK) } });
  host.send({ t: 'lobby', id: 'start', op: { op: 'start' } });
  for (let i = 0; i < 100 && !host.view; i++) await sleep(50);
  if (!host.view) throw new Error('The game did not start');

  const roundTrips: number[] = [];
  let rejects = 0;
  let timeouts = 0;
  let id = 0;
  let idle = 0;
  const startedAt = Date.now();

  while (roundTrips.length < MAX_ACTIONS && host.view!.status === 'playing' && idle < 200) {
    const actor = players.find((p) => p.view && pickActor(p.view as unknown as GameState) === p.id);
    if (!actor) {
      idle++;
      await sleep(100);
      continue;
    }
    idle = 0;

    for (const action of botActions(actor.view as unknown as GameState, actor.id, rand)) {
      const { player: _player, ...rest } = action as { player: string };
      const sent = Date.now();
      const reply = await actor.request({ t: 'action', id: `m${++id}`, action: rest as ClientAction, expectedVersion: actor.version });
      if (!reply) timeouts++;
      else if (reply.t === 'reject') rejects++;
      else {
        roundTrips.push(Date.now() - sent);
        break;
      }
    }
  }

  await sleep(500);
  const versions = [...players, watcher].map((c) => c.version);
  report.push(`Played ${roundTrips.length} accepted actions in ${((Date.now() - startedAt) / 1000).toFixed(0)} s (turn ${host.view!.turn.number}), ${rejects} rejected tries, ${timeouts} timeouts`);
  report.push(`Action round trip (send -> patch back): median ${percentile(roundTrips, 50)} ms, p90 ${percentile(roundTrips, 90)} ms, p99 ${percentile(roundTrips, 99)} ms`);
  report.push(`Everyone on the same version at the end: ${new Set(versions).size === 1 ? `yes (${versions[0]})` : `NO ${versions.join(',')}`}. Out-of-order patches: ${players.reduce((s, p) => s + p.outOfSync, 0)}`);

  await host.request({ t: 'lobby', id: 'end', op: { op: 'endGame' } });
  await sleep(500);
  report.push(`Host ended the game: status ${host.view!.status}, spectator sees ${watcher.view!.status}`);

  for (const c of [...players, watcher]) c.ws?.close();
  console.log(report.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
