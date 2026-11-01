import { DatabaseSync } from 'node:sqlite';
import type { ClientMessage, RoomView, ServerMessage } from '../../shared/src/protocol.ts';
import { applyPatch } from '../../shared/src/sync.ts';
import type { GameView } from '../../shared/src/view.ts';
import type { Conn, ConnInfo, RoomHost, SqlValue } from '../src/core/host.ts';
import { RoomCore } from '../src/core/room.ts';

export const T0 = 1_800_000_000_000;

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}

export class FakeConn implements Conn {
  open = true;
  messages: ServerMessage[] = [];
  view: GameView | null = null;
  version = 0;
  room: RoomView | null = null;
  you: { id: string; role: string; token?: string } | null = null;
  private attachment: ConnInfo | null = null;
  private owner: TestRoom;

  constructor(owner: TestRoom) {
    this.owner = owner;
  }

  send(data: string): void {
    if (!this.open) return;
    const message = JSON.parse(data) as ServerMessage;
    this.messages.push(message);

    if (message.t === 'welcome') {
      this.you = message.you;
      this.room = message.room;
      this.view = message.game;
      this.version = message.version;
    } else if (message.t === 'game') {
      this.view = message.game;
      this.version = message.version;
    } else if (message.t === 'patch') {
      if (message.from !== this.version) throw new Error(`Patch from ${message.from} but client is at ${this.version}`);
      this.view = applyPatch(this.view, message.ops);
      this.version = message.to;
    } else if (message.t === 'room') {
      this.room = message.room;
    }
  }

  close(): void {
    this.open = false;
  }

  info(): ConnInfo | null {
    return this.attachment;
  }

  setInfo(info: ConnInfo): void {
    this.attachment = info;
  }

  async say(message: ClientMessage): Promise<void> {
    await this.owner.core.onMessage(this, JSON.stringify(message));
  }

  last<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].t === type) return this.messages[i] as Extract<ServerMessage, { t: T }>;
    }
    return undefined;
  }

  drop(): void {
    this.open = false;
    this.owner.core.onClose(this);
  }
}

export class TestRoom {
  db: DatabaseSync;
  conns: FakeConn[] = [];
  alarm: number | null = null;
  now: number;
  core: RoomCore;

  constructor(db = new DatabaseSync(':memory:'), now = T0) {
    this.db = db;
    this.now = now;
    this.core = new RoomCore(this.host());
  }

  static create(): TestRoom {
    const room = new TestRoom();
    room.core.init('ABCDEF');
    return room;
  }

  private host(): RoomHost {
    return {
      sql: {
        exec: (query: string, ...params: SqlValue[]) => {
          const statement = this.db.prepare(query);
          if (/^\s*SELECT/i.test(query)) return { rows: statement.all(...params) as Record<string, SqlValue>[], rowsWritten: 0 };
          const result = statement.run(...params);
          return { rows: [], rowsWritten: Number(result.changes) };
        }
      },
      transaction: (fn) => {
        this.db.exec('BEGIN');
        try {
          fn();
          this.db.exec('COMMIT');
        } catch (error) {
          this.db.exec('ROLLBACK');
          throw error;
        }
      },
      conns: () => this.conns.filter((c) => c.open),
      setAlarm: (at) => {
        this.alarm = at;
      },
      now: () => this.now,
      deleteAll: () => {
        for (const table of ['meta', 'game', 'actions', 'members', 'chat']) this.db.exec(`DROP TABLE IF EXISTS ${table}`);
        this.alarm = null;
      }
    };
  }

  connect(): FakeConn {
    const conn = new FakeConn(this);
    this.conns.push(conn);
    return conn;
  }

  async join(name: string, spectate = false): Promise<FakeConn> {
    const conn = this.connect();
    await conn.say({ t: 'hello', name, spectate });
    return conn;
  }

  async rejoin(token: string): Promise<FakeConn> {
    const conn = this.connect();
    await conn.say({ t: 'hello', token });
    return conn;
  }

  restart(): TestRoom {
    for (const conn of this.conns) conn.open = false;
    const next = new TestRoom(this.db, this.now);
    next.alarm = this.alarm;
    next.core.onStart();
    return next;
  }

  advance(ms: number): void {
    const target = this.now + ms;
    for (let guard = 0; guard < 1000 && this.alarm !== null && this.alarm <= target; guard++) {
      this.now = Math.max(this.now, this.alarm);
      this.core.onAlarm();
    }
    this.now = target;
  }

  state() {
    return this.core.debugState();
  }
}
