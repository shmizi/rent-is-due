import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStored, removeStored, writeStored } from '../src/lib/storage.ts';
import { RoomConnection } from '../src/net/connection.ts';

class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = FakeSocket.OPEN;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string) {
    if (data !== 'ping') this.sent.push(JSON.parse(data));
  }

  close() {}
}

const brokenStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  }
};

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeSocket.all = [];
});

describe('room connection', () => {
  it('reclaims its seat after a drop even when browser storage is blocked', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('localStorage', brokenStorage);
    vi.stubGlobal('location', { protocol: 'https:', host: 'example.test' });

    const connection = new RoomConnection('ABCDEF');
    connection.join('Sam', false);

    const first = FakeSocket.all[0];
    first.onopen!();
    expect(first.sent[0]).toEqual({ t: 'hello', name: 'Sam', spectate: false });

    first.onmessage!({
      data: JSON.stringify({ t: 'welcome', you: { id: 'u1', role: 'player', token: 'seat-token' }, room: null, game: null, version: 0, log: [], chat: [], at: Date.now() })
    });
    first.onclose!({ code: 1006 });
    vi.advanceTimersByTime(1000);

    const second = FakeSocket.all[1];
    second.onopen!();
    expect(second.sent[0]).toEqual({ t: 'hello', token: 'seat-token' });
    connection.stop();
  });

  it('says the room has closed instead of retrying when a saved room is gone', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('localStorage', memoryStorage({ 'rent-is-due:ABCDEF': JSON.stringify({ token: 'old', name: 'Sam' }) }));
    vi.stubGlobal('location', { protocol: 'https:', host: 'example.test' });

    const connection = new RoomConnection('ABCDEF');
    connection.start();
    const socket = FakeSocket.all[0];
    socket.onopen!();
    expect(socket.sent[0]).toEqual({ t: 'hello', token: 'old' });

    socket.onmessage!({ data: JSON.stringify({ t: 'reject', code: 'noRoom', message: 'This room does not exist.' }) });
    socket.onclose!({ code: 4004 });
    vi.advanceTimersByTime(30_000);

    expect(connection.state.fatal?.code).toBe('noRoom');
    expect(connection.state.status).toBe('closed');
    expect(FakeSocket.all).toHaveLength(1);
    expect(localStorage.getItem('rent-is-due:ABCDEF')).toBeNull();
  });

  it('shows the closed message when the room shuts while you are in it', () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('localStorage', memoryStorage({}));
    vi.stubGlobal('location', { protocol: 'https:', host: 'example.test' });

    const connection = new RoomConnection('ABCDEF');
    connection.join('Sam', false);
    FakeSocket.all[0].onclose!({ code: 4001 });

    expect(connection.state.fatal?.code).toBe('noRoom');
  });
});

describe('storage', () => {
  it('never throws when the browser blocks storage', () => {
    vi.stubGlobal('localStorage', brokenStorage);
    vi.stubGlobal('sessionStorage', brokenStorage);

    expect(readStored('local', 'x')).toBeNull();
    expect(() => writeStored('session', 'x', 'y')).not.toThrow();
    expect(() => removeStored('local', 'x')).not.toThrow();
  });
});
