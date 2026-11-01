export type SqlValue = string | number | null;

export interface SqlResult {
  rows: Record<string, SqlValue>[];
  rowsWritten: number;
}

export interface Sql {
  exec(query: string, ...params: SqlValue[]): SqlResult;
}

export interface ConnInfo {
  connId: string;
  playerId: string;
}

export interface Conn {
  send(data: string): void;
  close(code: number, reason: string): void;
  info(): ConnInfo | null;
  setInfo(info: ConnInfo): void;
}

export interface RoomHost {
  sql: Sql;
  transaction(fn: () => void): void;
  conns(): Conn[];
  setAlarm(at: number | null): void;
  now(): number;
  deleteAll(): void;
  seed?(): number;
}

export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] | 0;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
