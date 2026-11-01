import type { ChatMessage, ClientAction, ClientMessage, LobbyOp, Role, RoomView, ServerMessage } from '../../../shared/src/protocol.ts';
import { applyPatch } from '../../../shared/src/sync.ts';
import type { GameEvent } from '../../../shared/src/types.ts';
import type { GameView } from '../../../shared/src/view.ts';

export type Status = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'info';
}

export interface RoomState {
  status: Status;
  code: string;
  you: { id: string; role: Role } | null;
  room: RoomView | null;
  game: GameView | null;
  version: number;
  log: GameEvent[];
  chat: ChatMessage[];
  fatal: { code: string; message: string } | null;
  needsName: boolean;
  toasts: Toast[];
  clockOffset: number;
  lastEvents: GameEvent[];
}

const LOG_KEEP = 150;
const VERSIONED = new Set(['roll', 'buy', 'decline', 'endTurn', 'payJailFine', 'useJailCard']);

export function tokenKey(code: string): string {
  return `rent-is-due:${code}`;
}

export function savedSeat(code: string): { token: string; name: string } | null {
  try {
    const raw = localStorage.getItem(tokenKey(code));
    return raw ? (JSON.parse(raw) as { token: string; name: string }) : null;
  } catch {
    return null;
  }
}

function saveSeat(code: string, token: string, name: string): void {
  try {
    localStorage.setItem(tokenKey(code), JSON.stringify({ token, name }));
  } catch {
    // private mode: the seat only lasts for this tab
  }
}

function forgetSeat(code: string): void {
  try {
    localStorage.removeItem(tokenKey(code));
  } catch {
    // nothing stored
  }
}

export class RoomConnection {
  state: RoomState;
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private joinName: string | null = null;
  private token: string | null = null;
  private spectate = false;
  private nextId = 1;
  private nextToast = 1;
  private stopped = false;

  constructor(code: string) {
    this.state = {
      status: 'connecting',
      code,
      you: null,
      room: null,
      game: null,
      version: 0,
      log: [],
      chat: [],
      fatal: null,
      needsName: savedSeat(code) === null,
      toasts: [],
      clockOffset: 0,
      lastEvents: []
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): RoomState => this.state;

  private set(patch: Partial<RoomState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  start(): void {
    this.stopped = false;
    if (!this.state.needsName) this.open();
  }

  join(name: string, spectate: boolean): void {
    this.joinName = name;
    this.spectate = spectate;
    this.set({ needsName: false, status: 'connecting' });
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }

  private open(): void {
    if (this.stopped) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${location.host}/ws/${this.state.code}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      const token = this.token ?? savedSeat(this.state.code)?.token;
      const hello: ClientMessage = token ? { t: 'hello', token } : { t: 'hello', name: this.joinName ?? '', spectate: this.spectate };
      ws.send(JSON.stringify(hello));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), 25_000);
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      this.receive(JSON.parse(String(event.data)) as ServerMessage);
    };

    ws.onclose = (event) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      if (this.stopped || this.state.fatal || event.code === 4003 || event.code === 4004 || event.code === 4001) {
        this.set({ status: 'closed' });
        return;
      }
      this.set({ status: this.state.you ? 'reconnecting' : 'connecting' });
      const delay = Math.min(10_000, 500 * 2 ** this.retries++);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }

  private receive(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome': {
        if (message.you.token) {
          this.token = message.you.token;
          saveSeat(this.state.code, message.you.token, this.joinName ?? '');
        }
        this.set({
          status: 'open',
          you: { id: message.you.id, role: message.you.role },
          room: message.room,
          game: message.game,
          version: message.version,
          log: message.log,
          chat: message.chat,
          clockOffset: message.at - Date.now(),
          fatal: null
        });
        return;
      }

      case 'room':
        this.set({ room: message.room });
        return;

      case 'game':
        this.set({ game: message.game, version: message.version, log: message.log, clockOffset: message.at - Date.now() });
        return;

      case 'patch': {
        if (message.from !== this.state.version || !this.state.game) {
          this.send({ t: 'sync' });
          return;
        }
        const game = applyPatch(structuredClone(this.state.game), message.ops);
        const log = [...this.state.log, ...message.events].slice(-LOG_KEEP);
        this.set({ game, version: message.to, log, lastEvents: message.events, clockOffset: message.at - Date.now() });
        return;
      }

      case 'chat':
        this.set({ chat: [...this.state.chat, message.message].slice(-200) });
        return;

      case 'reject':
        this.reject(message.code, message.message);
        return;

      case 'kicked':
        this.token = null;
        forgetSeat(this.state.code);
        this.set({ fatal: { code: 'kicked', message: 'The host removed you from this room.' }, status: 'closed' });
        return;
    }
  }

  private reject(code: string, message: string): void {
    if (code === 'badToken') {
      this.token = null;
      forgetSeat(this.state.code);
      if (this.joinName) {
        this.ws?.close();
        return;
      }
      this.set({ needsName: true, you: null });
      this.ws?.close();
      return;
    }

    if (['noRoom', 'roomFull', 'gameStarted'].includes(code)) {
      this.set({ fatal: { code, message }, status: 'closed' });
      this.ws?.close();
      return;
    }

    if (code === 'badName') {
      this.set({ needsName: true });
    }

    this.toast(message, 'error');
  }

  toast(text: string, tone: Toast['tone'] = 'info'): void {
    const toast = { id: this.nextToast++, text, tone };
    this.set({ toasts: [...this.state.toasts, toast].slice(-3) });
    setTimeout(() => this.set({ toasts: this.state.toasts.filter((t) => t.id !== toast.id) }), 4000);
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
    else this.toast('Not connected right now. Hang on a second.', 'error');
  }

  act(action: ClientAction): void {
    const expectedVersion = VERSIONED.has(action.type) ? this.state.version : undefined;
    this.send({ t: 'action', id: `a${this.nextId++}`, action, expectedVersion });
  }

  lobby(op: LobbyOp): void {
    this.send({ t: 'lobby', id: `l${this.nextId++}`, op });
  }

  say(text: string): void {
    this.send({ t: 'chat', text });
  }

  serverNow(): number {
    return Date.now() + this.state.clockOffset;
  }
}
