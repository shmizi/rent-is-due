import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
