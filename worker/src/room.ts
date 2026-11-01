import { DurableObject } from 'cloudflare:workers';
import type { ServerMessage } from '../../shared/src/protocol.ts';
import type { Conn, ConnInfo, RoomHost, SqlValue } from './core/host.ts';
import { RoomCore } from './core/room.ts';

function wrap(ws: WebSocket): Conn {
  return {
    send(data) {
      try {
        ws.send(data);
      } catch {
        // the socket is already closing
      }
    },
    close(code, reason) {
      try {
        ws.close(code, reason);
      } catch {
        // the socket is already closed
      }
    },
    info: () => (ws.deserializeAttachment() as ConnInfo | null) ?? null,
    setInfo: (info) => ws.serializeAttachment(info)
  };
}

export class RoomObject extends DurableObject<Env> {
  private core: RoomCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    const host: RoomHost = {
      sql: {
        exec(query: string, ...params: SqlValue[]) {
          const cursor = ctx.storage.sql.exec(query, ...params);
          const rows = cursor.toArray() as Record<string, SqlValue>[];
          return { rows, rowsWritten: cursor.rowsWritten };
        }
      },
      transaction: (fn) => ctx.storage.transactionSync(fn),
      conns: () => ctx.getWebSockets().map(wrap),
      setAlarm: (at) => {
        if (at === null) void ctx.storage.deleteAlarm();
        else void ctx.storage.setAlarm(at);
      },
      now: () => Date.now(),
      deleteAll: () => {
        void ctx.storage.deleteAlarm();
        void ctx.storage.deleteAll();
      }
    };

    this.core = new RoomCore(host);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => this.core.onStart());
  }

  async init(code: string): Promise<boolean> {
    return this.core.init(code);
  }

  async info() {
    return this.core.info();
  }

  async debugState() {
    return this.core.debugState();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (!this.core.exists()) {
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(JSON.stringify({ t: 'reject', code: 'noRoom', message: 'This room does not exist.' } satisfies ServerMessage));
      pair[1].close(4004, 'No such room');
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    await this.core.onMessage(wrap(ws), message);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.core.onClose(wrap(ws));
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.core.onClose(wrap(ws));
  }

  async alarm(): Promise<void> {
    this.core.onAlarm();
  }
}
