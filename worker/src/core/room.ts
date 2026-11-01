import { applyActionSafe } from '../../../shared/src/engine/apply.ts';
import { createGame } from '../../../shared/src/engine/create.ts';
import { nextDeadline } from '../../../shared/src/engine/timers.ts';
import { getMap } from '../../../shared/src/maps/index.ts';
import {
  PLAYER_COLORS,
  TOKEN_SHAPES,
  type ChatMessage,
  type ClientMessage,
  type LobbyOp,
  type MemberView,
  type PresetName,
  type Role,
  type RoomPhase,
  type RoomView,
  type ServerMessage
} from '../../../shared/src/protocol.ts';
import { CLASSIC, normalizeSettings, PRESETS } from '../../../shared/src/settings.ts';
import { diff } from '../../../shared/src/sync.ts';
import type { Action, GameEvent, GameState, PlayerAction, Settings } from '../../../shared/src/types.ts';
import { gameView, visibleEvents } from '../../../shared/src/view.ts';
import { randomHex, randomSeed, sha256, type Conn, type RoomHost, type SqlValue } from './host.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const GRACE_MS = 15 * SECOND;
const HOST_AWAY_MS = 2 * MINUTE;
const RESTART_MIN_MS = 30 * SECOND;
const IDLE_LIMIT: Record<RoomPhase, number> = { lobby: DAY, playing: 14 * DAY, finished: 30 * DAY };
const CHAT_KEEP = 200;
const HISTORY_SENT = 50;
const RATE_WINDOW_MS = 2 * SECOND;
const RATE_LIMIT = 25;
const SPECTATOR_COLOR = '#9AA0C8';

const PLAYER_ACTIONS = new Set<string>([
  'roll', 'payJailFine', 'useJailCard', 'buy', 'decline', 'endTurn', 'bid', 'dropOut',
  'build', 'sellBuilding', 'mortgage', 'unmortgage', 'proposeTrade', 'acceptTrade',
  'declineTrade', 'cancelTrade', 'counterTrade', 'declareBankruptcy', 'leave', 'voteExtend'
]);

export interface RoomStats {
  messages: number;
  alarms: number;
  actions: number;
  rowsWritten: number;
  gameStartedAt: number | null;
}

export interface RoomMeta {
  schema: 1;
  code: string;
  createdAt: number;
  lastActivity: number;
  phase: RoomPhase;
  hostId: string | null;
  mapId: string;
  settings: Settings;
  preset: PresetName;
  notes: string[];
  muted: string[];
  graces: Record<string, number>;
  hostAwaySince: number | null;
  stats: RoomStats;
}

interface Member {
  id: string;
  tokenHash: string;
  name: string;
  color: string;
  shape: string;
  role: Role;
  joinedAt: number;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= 20 ? name : null;
}

export class RoomCore {
  private host: RoomHost;
  private meta: RoomMeta | null = null;
  private game: GameState | null = null;
  private memberCache: Member[] | null = null;
  private alarmAt: number | null | undefined = undefined;
  private rates = new Map<string, { start: number; count: number }>();

  constructor(host: RoomHost) {
    this.host = host;
    this.load();
  }

  private exec(query: string, ...params: SqlValue[]) {
    const result = this.host.sql.exec(query, ...params);
    if (this.meta) this.meta.stats.rowsWritten += result.rowsWritten;
    return result.rows;
  }

  private load(): void {
    const tables = this.host.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'").rows;
    if (tables.length === 0) return;

    const meta = this.host.sql.exec("SELECT value FROM meta WHERE key = 'room'").rows[0];
    this.meta = meta ? (JSON.parse(meta.value as string) as RoomMeta) : null;

    const game = this.host.sql.exec('SELECT json FROM game WHERE id = 1').rows[0];
    this.game = game ? (JSON.parse(game.json as string) as GameState) : null;
  }

  private createTables(): void {
    this.host.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.host.sql.exec('CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, json TEXT NOT NULL)');
    this.host.sql.exec(
      'CREATE TABLE IF NOT EXISTS actions (seq INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER NOT NULL, player TEXT, action TEXT NOT NULL, at INTEGER NOT NULL)'
    );
    this.host.sql.exec(
      'CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, shape TEXT NOT NULL, role TEXT NOT NULL, joined_at INTEGER NOT NULL)'
    );
    this.host.sql.exec(
      'CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL)'
    );
  }

  private saveMeta(): void {
    if (!this.meta) return;
    this.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('room', ?)", JSON.stringify(this.meta));
  }

  private saveGame(action: Action | null): void {
    const game = this.game;
    if (!game) return;

    this.host.transaction(() => {
      this.exec('INSERT OR REPLACE INTO game (id, version, json) VALUES (1, ?, ?)', game.version, JSON.stringify(game));
      if (action) {
        const player = 'player' in action ? action.player : null;
        this.exec('INSERT INTO actions (version, player, action, at) VALUES (?, ?, ?, ?)', game.version, player, JSON.stringify(action), this.host.now());
      }
      this.saveMeta();
    });
  }

  exists(): boolean {
    return this.meta !== null;
  }

  init(code: string): boolean {
    if (this.meta) return false;

    const now = this.host.now();
    this.createTables();
    const map = getMap('harborview');
    const { settings, notes } = normalizeSettings(CLASSIC, map);

    this.meta = {
      schema: 1,
      code,
      createdAt: now,
      lastActivity: now,
      phase: 'lobby',
      hostId: null,
      mapId: map.id,
      settings,
      preset: 'classic',
      notes,
      muted: [],
      graces: {},
      hostAwaySince: null,
      stats: { messages: 0, alarms: 0, actions: 0, rowsWritten: 0, gameStartedAt: null }
    };

    this.saveMeta();
    this.scheduleAlarm();
    return true;
  }

  info() {
    if (!this.meta) return { exists: false as const };
    const players = this.members().filter((m) => m.role === 'player').length;
    return {
      exists: true as const,
      phase: this.meta.phase,
      players,
      seats: this.meta.settings.room.maxPlayers,
      spectators: this.meta.settings.room.spectators
    };
  }

  debugState() {
    return { meta: this.meta, game: this.game, members: this.members().map(({ tokenHash: _hash, ...m }) => m) };
  }

  onStart(): void {
    const meta = this.meta;
    if (!meta) return;

    if (meta.phase === 'playing' && this.game) {
      const live = this.livePlayers();
      const now = this.host.now();
      let missing = false;

      for (const p of this.game.players) {
        if (p.status === 'active' && p.connected && !live.has(p.id) && meta.graces[p.id] === undefined) {
          meta.graces[p.id] = now + GRACE_MS;
          missing = true;
        }
      }

      if (missing) {
        if (!this.runEngine({ type: 'extendDeadlines', minMs: RESTART_MIN_MS }, null)) this.saveMeta();
      }
    }

    this.scheduleAlarm();
  }

  private members(): Member[] {
    if (!this.meta) return [];
    if (!this.memberCache) {
      this.memberCache = this.host.sql.exec('SELECT * FROM members ORDER BY joined_at, rowid').rows.map((r) => ({
        id: r.id as string,
        tokenHash: r.token_hash as string,
        name: r.name as string,
        color: r.color as string,
        shape: r.shape as string,
        role: r.role as Role,
        joinedAt: r.joined_at as number
      }));
    }
    return this.memberCache;
  }

  private member(id: string): Member | undefined {
    return this.members().find((m) => m.id === id);
  }

  private livePlayers(): Set<string> {
    const ids = new Set<string>();
    for (const conn of this.host.conns()) {
      const info = conn.info();
      if (info) ids.add(info.playerId);
    }
    return ids;
  }

  private viewerId(memberId: string): string | null {
    const member = this.member(memberId);
    if (!member || member.role !== 'player' || !this.game) return null;
    return this.game.players.some((p) => p.id === memberId) ? memberId : null;
  }

  private roomView(): RoomView {
    const meta = this.meta!;
    const live = this.livePlayers();
    const members: MemberView[] = this.members().map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      shape: m.shape,
      role: m.role,
      connected: live.has(m.id),
      host: meta.hostId === m.id,
      muted: meta.muted.includes(m.id)
    }));

    return { code: meta.code, phase: meta.phase, mapId: meta.mapId, settings: meta.settings, preset: meta.preset, notes: meta.notes, members };
  }

  private recentChat(): ChatMessage[] {
    return this.host.sql
      .exec('SELECT * FROM chat ORDER BY id DESC LIMIT ?', HISTORY_SENT)
      .rows.reverse()
      .map((r) => ({ id: r.id as number, from: r.sender as string, name: r.name as string, role: r.role as Role, text: r.text as string, at: r.at as number }));
  }

  private send(conn: Conn, message: ServerMessage): void {
    conn.send(JSON.stringify(message));
  }

  private reject(conn: Conn, id: string | undefined, code: string, message: string): void {
    this.send(conn, { t: 'reject', id, code, message });
  }

  private broadcast(message: ServerMessage): void {
    const text = JSON.stringify(message);
    for (const conn of this.host.conns()) {
      if (conn.info()) conn.send(text);
    }
  }

  private broadcastRoom(): void {
    this.broadcast({ t: 'room', room: this.roomView() });
  }

  private gameSnapshot(memberId: string): ServerMessage {
    const game = this.game;
    const viewer = this.viewerId(memberId);
    return {
      t: 'game',
      game: game ? gameView(game, viewer) : null,
      version: game?.version ?? 0,
      log: game ? visibleEvents(game.log.slice(-HISTORY_SENT), viewer) : [],
      at: this.host.now()
    };
  }

  private broadcastSnapshots(): void {
    for (const conn of this.host.conns()) {
      const info = conn.info();
      if (info) this.send(conn, this.gameSnapshot(info.playerId));
    }
  }

  private broadcastGame(before: GameState, after: GameState, events: GameEvent[]): void {
    const cache = new Map<string, string>();

    for (const conn of this.host.conns()) {
      const info = conn.info();
      if (!info) continue;

      const viewer = this.viewerId(info.playerId);
      const key = viewer ?? '*';
      let text = cache.get(key);
      if (!text) {
        const ops = diff(gameView(before, viewer), gameView(after, viewer));
        text = JSON.stringify({ t: 'patch', from: before.version, to: after.version, ops, events: visibleEvents(events, viewer), at: this.host.now() } satisfies ServerMessage);
        cache.set(key, text);
      }
      conn.send(text);
    }
  }

  private runEngine(action: Action, reply: { conn: Conn; id: string } | null, expectedVersion?: number): boolean {
    const meta = this.meta!;
    const before = this.game;
    if (!before) return false;

    const now = this.host.now();
    let result;
    try {
      result = applyActionSafe(before, action, now, expectedVersion);
    } catch {
      if (reply) this.reject(reply.conn, reply.id, 'badAction', 'That action is not valid.');
      return false;
    }

    if (!result.ok) {
      if (reply) this.reject(reply.conn, reply.id, result.code, result.message);
      return false;
    }

    this.game = result.state;
    meta.lastActivity = now;
    meta.stats.actions++;

    const finishedNow = this.game.status === 'finished' && meta.phase === 'playing';
    if (finishedNow) meta.phase = 'finished';

    this.saveGame(action);
    this.broadcastGame(before, this.game, result.events);
    if (finishedNow) this.broadcastRoom();
    this.scheduleAlarm();
    return true;
  }

  private allow(playerId: string, now: number): boolean {
    const rate = this.rates.get(playerId);
    if (!rate || now - rate.start > RATE_WINDOW_MS) {
      this.rates.set(playerId, { start: now, count: 1 });
      return true;
    }
    rate.count++;
    return rate.count <= RATE_LIMIT;
  }

  async onMessage(conn: Conn, raw: string): Promise<void> {
    if (!this.meta) {
      this.reject(conn, undefined, 'noRoom', 'This room does not exist.');
      conn.close(4004, 'No such room');
      return;
    }

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      this.reject(conn, undefined, 'badMessage', 'That message could not be read.');
      return;
    }
    if (!message || typeof message !== 'object' || typeof message.t !== 'string') {
      this.reject(conn, undefined, 'badMessage', 'That message could not be read.');
      return;
    }

    this.meta.stats.messages++;

    if (message.t === 'hello') {
      await this.hello(conn, message);
      return;
    }

    const info = conn.info();
    if (!info || !this.member(info.playerId)) {
      this.reject(conn, undefined, 'helloFirst', 'Join the room first.');
      return;
    }

    if (!this.allow(info.playerId, this.host.now())) {
      this.reject(conn, 'id' in message ? message.id : undefined, 'rateLimited', 'Slow down a little.');
      return;
    }

    switch (message.t) {
      case 'action':
        this.playerAction(conn, info.playerId, message);
        return;
      case 'lobby':
        this.lobbyOp(conn, info.playerId, message.id, message.op);
        return;
      case 'chat':
        this.chat(conn, info.playerId, message.text);
        return;
      case 'sync':
        this.send(conn, this.gameSnapshot(info.playerId));
        return;
      default:
        this.reject(conn, undefined, 'badMessage', 'Unknown message.');
    }
  }

  private async hello(conn: Conn, message: Extract<ClientMessage, { t: 'hello' }>): Promise<void> {
    if (typeof message.token === 'string' && message.token.length > 0) {
      const hash = await sha256(message.token);
      this.resume(conn, hash);
      return;
    }

    const token = randomHex(32);
    const hash = await sha256(token);
    this.join(conn, message, token, hash);
  }

  private resume(conn: Conn, hash: string): void {
    const meta = this.meta!;
    const member = this.members().find((m) => m.tokenHash === hash);
    if (!member) {
      this.reject(conn, undefined, 'badToken', 'That seat is not in this room any more.');
      return;
    }

    delete meta.graces[member.id];
    if (meta.hostId === member.id) meta.hostAwaySince = null;
    meta.lastActivity = this.host.now();

    const inGame = this.game?.players.find((p) => p.id === member.id);
    const reconnected = meta.phase === 'playing' && inGame?.status === 'active' && !inGame.connected
      ? this.runEngine({ type: 'reconnect', player: member.id }, null)
      : false;
    if (!reconnected) this.saveMeta();

    conn.setInfo({ connId: randomHex(8), playerId: member.id });
    this.welcome(conn, member);
    this.broadcastRoom();
  }

  private join(conn: Conn, message: Extract<ClientMessage, { t: 'hello' }>, token: string, hash: string): void {
    const meta = this.meta!;
    const name = cleanName(message.name);
    if (!name) {
      this.reject(conn, undefined, 'badName', 'Pick a name between 1 and 20 characters.');
      return;
    }

    const players = this.members().filter((m) => m.role === 'player');
    let role: Role;
    if (meta.phase === 'lobby' && !message.spectate && players.length < meta.settings.room.maxPlayers) {
      role = 'player';
    } else if (meta.settings.room.spectators) {
      role = 'spectator';
    } else {
      this.reject(conn, undefined, meta.phase === 'lobby' ? 'roomFull' : 'gameStarted', meta.phase === 'lobby' ? 'This room is full.' : 'This game has already started.');
      return;
    }

    const taken = new Set(players.map((m) => m.color));
    const color = role === 'player' ? (PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0]) : SPECTATOR_COLOR;
    const now = this.host.now();
    const member: Member = { id: `u${randomHex(6)}`, tokenHash: hash, name, color, shape: TOKEN_SHAPES[0], role, joinedAt: now };

    this.exec(
      'INSERT INTO members (id, token_hash, name, color, shape, role, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      member.id, member.tokenHash, member.name, member.color, member.shape, member.role, member.joinedAt
    );
    this.memberCache = null;

    if (role === 'player' && meta.hostId === null) meta.hostId = member.id;
    meta.lastActivity = now;
    this.saveMeta();

    conn.setInfo({ connId: randomHex(8), playerId: member.id });
    this.welcome(conn, member, token);
    this.broadcastRoom();
  }

  private welcome(conn: Conn, member: Member, token?: string): void {
    const game = this.game;
    const viewer = this.viewerId(member.id);
    this.send(conn, {
      t: 'welcome',
      you: { id: member.id, role: member.role, token },
      room: this.roomView(),
      game: game ? gameView(game, viewer) : null,
      version: game?.version ?? 0,
      log: game ? visibleEvents(game.log.slice(-HISTORY_SENT), viewer) : [],
      chat: this.recentChat(),
      at: this.host.now()
    });
  }

  private playerAction(conn: Conn, playerId: string, message: Extract<ClientMessage, { t: 'action' }>): void {
    const meta = this.meta!;
    if (meta.phase !== 'playing' || !this.game) {
      this.reject(conn, message.id, 'notPlaying', 'The game has not started.');
      return;
    }
    if (this.member(playerId)?.role !== 'player') {
      this.reject(conn, message.id, 'spectator', 'Spectators cannot play.');
      return;
    }
    if (!message.action || typeof message.action !== 'object' || !PLAYER_ACTIONS.has(message.action.type)) {
      this.reject(conn, message.id, 'badAction', 'That action is not valid.');
      return;
    }

    const action = { ...message.action, player: playerId } as PlayerAction;
    const expected = typeof message.expectedVersion === 'number' ? message.expectedVersion : undefined;
    this.runEngine(action, { conn, id: message.id }, expected);
  }

  private lobbyOp(conn: Conn, playerId: string, id: string, op: LobbyOp): void {
    const meta = this.meta!;
    const isHost = meta.hostId === playerId;
    const hostOnly = op && op.op !== 'appearance';

    if (!op || typeof op !== 'object') {
      this.reject(conn, id, 'badMessage', 'Unknown room request.');
      return;
    }
    if (hostOnly && !isHost) {
      this.reject(conn, id, 'notHost', 'Only the host can do that.');
      return;
    }

    switch (op.op) {
      case 'appearance':
        return this.appearance(conn, id, playerId, op);
      case 'settings':
        return this.changeSettings(conn, id, op.settings, 'custom');
      case 'preset':
        if (!(op.preset in PRESETS)) return this.reject(conn, id, 'badPreset', 'Unknown preset.');
        return this.changeSettings(conn, id, PRESETS[op.preset], op.preset);
      case 'start':
        return this.start(conn, id);
      case 'rematch':
        return this.rematch(conn, id);
      case 'kick':
        return this.kick(conn, id, playerId, op.player);
      case 'transferHost': {
        const target = this.member(op.player);
        if (!target || target.role !== 'player') return this.reject(conn, id, 'badTarget', 'Pick a player to be the host.');
        meta.hostId = target.id;
        meta.hostAwaySince = this.livePlayers().has(target.id) ? null : this.host.now();
        this.saveMeta();
        this.broadcastRoom();
        return;
      }
      case 'mute': {
        const target = this.member(op.player);
        if (!target || target.role !== 'spectator') return this.reject(conn, id, 'badTarget', 'Only spectators can be muted.');
        meta.muted = meta.muted.filter((m) => m !== target.id);
        if (op.muted) meta.muted.push(target.id);
        this.saveMeta();
        this.broadcastRoom();
        return;
      }
      case 'pause':
      case 'resume':
      case 'endGame':
        if (meta.phase !== 'playing') return this.reject(conn, id, 'notPlaying', 'The game is not running.');
        this.runEngine({ type: op.op }, { conn, id });
        return;
      default:
        this.reject(conn, id, 'badMessage', 'Unknown room request.');
    }
  }

  private appearance(conn: Conn, id: string, playerId: string, op: Extract<LobbyOp, { op: 'appearance' }>): void {
    const meta = this.meta!;
    const member = this.member(playerId)!;
    if (meta.phase !== 'lobby') return this.reject(conn, id, 'notLobby', 'You can only change your look in the lobby.');

    const name = op.name === undefined ? member.name : cleanName(op.name);
    if (!name) return this.reject(conn, id, 'badName', 'Pick a name between 1 and 20 characters.');

    let color = member.color;
    if (op.color !== undefined && member.role === 'player') {
      if (!PLAYER_COLORS.includes(op.color)) return this.reject(conn, id, 'badColor', 'Pick one of the colours.');
      if (this.members().some((m) => m.id !== member.id && m.role === 'player' && m.color === op.color)) {
        return this.reject(conn, id, 'colorTaken', 'Someone already has that colour.');
      }
      color = op.color;
    }

    const shape = op.shape ?? member.shape;
    if (!TOKEN_SHAPES.includes(shape)) return this.reject(conn, id, 'badShape', 'Pick one of the token shapes.');

    this.exec('UPDATE members SET name = ?, color = ?, shape = ? WHERE id = ?', name, color, shape, member.id);
    this.memberCache = null;
    meta.lastActivity = this.host.now();
    this.saveMeta();
    this.broadcastRoom();
  }

  private changeSettings(conn: Conn, id: string, input: Settings, preset: PresetName): void {
    const meta = this.meta!;
    if (meta.phase !== 'lobby') return this.reject(conn, id, 'notLobby', 'Settings are locked once the game starts.');

    const players = this.members().filter((m) => m.role === 'player').length;
    let normalized;
    try {
      normalized = normalizeSettings(input, getMap(meta.mapId), Math.max(2, players));
    } catch {
      return this.reject(conn, id, 'badSettings', 'Those settings could not be read.');
    }

    const { settings, notes } = normalized;
    if (settings.room.maxPlayers < players) {
      settings.room.maxPlayers = players;
      notes.push(`Max players stays at ${players} because that many have already joined.`);
    }

    meta.settings = settings;
    meta.notes = notes;
    meta.preset = preset;
    meta.lastActivity = this.host.now();
    this.saveMeta();
    this.broadcastRoom();
  }

  private start(conn: Conn, id: string): void {
    const meta = this.meta!;
    if (meta.phase !== 'lobby') return this.reject(conn, id, 'notLobby', 'The game has already started.');

    const players = this.members().filter((m) => m.role === 'player');
    if (players.length < 2) return this.reject(conn, id, 'notEnoughPlayers', 'You need at least 2 players.');

    const now = this.host.now();
    this.game = createGame({
      mapId: meta.mapId,
      settings: meta.settings,
      players: players.map((m) => ({ id: m.id, name: m.name, color: m.color })),
      seed: randomSeed(),
      now
    });

    for (const p of this.game.players) {
      if (!this.livePlayers().has(p.id)) {
        p.connected = false;
        p.away = { deadline: now + this.game.settings.room.awayTimeoutMin * MINUTE, votes: [], extensions: 0 };
      }
    }

    meta.phase = 'playing';
    meta.lastActivity = now;
    meta.stats.gameStartedAt = now;
    this.saveGame(null);
    this.broadcastRoom();
    this.broadcastSnapshots();
    this.scheduleAlarm();
  }

  private rematch(conn: Conn, id: string): void {
    const meta = this.meta!;
    if (meta.phase !== 'finished') return this.reject(conn, id, 'notFinished', 'Finish this game first.');

    this.game = null;
    this.exec('DELETE FROM game');
    meta.phase = 'lobby';
    meta.graces = {};
    meta.lastActivity = this.host.now();
    this.saveMeta();
    this.broadcastRoom();
    this.broadcastSnapshots();
    this.scheduleAlarm();
  }

  private kick(conn: Conn, id: string, hostId: string, targetId: string): void {
    const meta = this.meta!;
    const target = this.member(targetId);
    if (!target || target.id === hostId) return this.reject(conn, id, 'badTarget', 'You cannot remove that person.');

    const inGame = this.game?.players.find((p) => p.id === target.id);
    if (meta.phase === 'playing' && inGame?.status === 'active') {
      this.runEngine({ type: 'remove', player: target.id }, null);
    }

    this.exec('DELETE FROM members WHERE id = ?', target.id);
    this.memberCache = null;
    delete meta.graces[target.id];
    meta.muted = meta.muted.filter((m) => m !== target.id);
    this.saveMeta();

    for (const c of this.host.conns()) {
      if (c.info()?.playerId === target.id) {
        this.send(c, { t: 'kicked' });
        c.close(4003, 'Removed by the host');
      }
    }

    this.broadcastRoom();
  }

  private chat(conn: Conn, playerId: string, raw: unknown): void {
    const meta = this.meta!;
    const member = this.member(playerId)!;
    const text = typeof raw === 'string' ? raw.trim() : '';

    if (text.length === 0 || text.length > 300) return this.reject(conn, undefined, 'badChat', 'Messages can be up to 300 characters.');
    if (member.role === 'spectator' && (!meta.settings.room.spectatorChat || meta.muted.includes(member.id))) {
      return this.reject(conn, undefined, 'chatOff', 'Spectator chat is off for you.');
    }

    const now = this.host.now();
    this.exec('INSERT INTO chat (sender, name, role, text, at) VALUES (?, ?, ?, ?, ?)', member.id, member.name, member.role, text, now);
    const id = this.host.sql.exec('SELECT MAX(id) AS id FROM chat').rows[0].id as number;
    if (id > CHAT_KEEP) this.exec('DELETE FROM chat WHERE id <= ?', id - CHAT_KEEP);

    meta.lastActivity = now;
    this.broadcast({ t: 'chat', message: { id, from: member.id, name: member.name, role: member.role, text, at: now } });
  }

  onClose(conn: Conn): void {
    const meta = this.meta;
    const info = conn.info();
    if (!meta || !info) return;

    const stillOpen = this.host.conns().some((c) => {
      const other = c.info();
      return other !== null && other.connId !== info.connId && other.playerId === info.playerId;
    });
    if (stillOpen) return;

    const now = this.host.now();
    meta.graces[info.playerId] = now + GRACE_MS;
    if (meta.hostId === info.playerId) meta.hostAwaySince = now;
    this.saveMeta();
    this.broadcastRoomExcept(info.connId);
    this.scheduleAlarm();
  }

  private broadcastRoomExcept(connId: string): void {
    const text = JSON.stringify({ t: 'room', room: this.roomViewWithout(connId) } satisfies ServerMessage);
    for (const conn of this.host.conns()) {
      const info = conn.info();
      if (info && info.connId !== connId) conn.send(text);
    }
  }

  private roomViewWithout(connId: string): RoomView {
    const view = this.roomView();
    const live = new Set<string>();
    for (const conn of this.host.conns()) {
      const info = conn.info();
      if (info && info.connId !== connId) live.add(info.playerId);
    }
    view.members = view.members.map((m) => ({ ...m, connected: live.has(m.id) }));
    return view;
  }

  onAlarm(): void {
    const meta = this.meta;
    if (!meta) return;

    const now = this.host.now();
    meta.stats.alarms++;
    const live = this.livePlayers();

    for (const [id, at] of Object.entries(meta.graces)) {
      if (at > now) continue;
      delete meta.graces[id];
      if (live.has(id)) continue;

      const inGame = this.game?.players.find((p) => p.id === id);
      if (meta.phase === 'playing' && inGame?.status === 'active' && inGame.connected) {
        this.runEngine({ type: 'disconnect', player: id }, null);
      }
    }

    if (meta.hostAwaySince !== null && now - meta.hostAwaySince >= HOST_AWAY_MS && meta.hostId !== null && !live.has(meta.hostId)) {
      const next = this.members().find((m) => m.role === 'player' && m.id !== meta.hostId && live.has(m.id));
      if (next) {
        meta.hostId = next.id;
        meta.hostAwaySince = null;
        this.broadcastRoom();
      } else {
        meta.hostAwaySince = now - HOST_AWAY_MS + MINUTE;
      }
    }

    if (meta.phase === 'playing' && this.game) {
      const deadline = nextDeadline(this.game);
      if (deadline !== null && deadline <= now) this.runEngine({ type: 'tick' }, null);
    }

    if (now >= meta.lastActivity + IDLE_LIMIT[meta.phase]) {
      this.destroy();
      return;
    }

    this.saveMeta();
    this.scheduleAlarm();
  }

  private destroy(): void {
    for (const conn of this.host.conns()) conn.close(4001, 'This room was closed after being idle.');
    this.host.deleteAll();
    this.meta = null;
    this.game = null;
    this.memberCache = null;
    this.alarmAt = undefined;
  }

  private scheduleAlarm(): void {
    const meta = this.meta;
    if (!meta) return;

    const times: number[] = [...Object.values(meta.graces), meta.lastActivity + IDLE_LIMIT[meta.phase]];
    if (meta.hostAwaySince !== null) times.push(meta.hostAwaySince + HOST_AWAY_MS);
    if (meta.phase === 'playing' && this.game) {
      const deadline = nextDeadline(this.game);
      if (deadline !== null) times.push(deadline);
    }

    const at = Math.min(...times);
    if (at !== this.alarmAt) {
      this.host.setAlarm(at);
      this.alarmAt = at;
    }
  }
}
