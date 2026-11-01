import type { PatchOp } from './sync.ts';
import type { GameEvent, PlayerAction, Settings } from './types.ts';
import type { GameView } from './view.ts';

export type Role = 'player' | 'spectator';

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export type PresetName = 'classic' | 'quick' | 'custom';

export const PLAYER_COLORS = ['#FF7A59', '#3DA5FF', '#B07CFF', '#9BE15D', '#FFC145', '#FF6FB5', '#4DE1E1', '#F2F2F7'];

export const TOKEN_SHAPES = ['circle', 'square', 'diamond', 'hex'];

export interface MemberView {
  id: string;
  name: string;
  color: string;
  shape: string;
  role: Role;
  connected: boolean;
  host: boolean;
  muted: boolean;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  mapId: string;
  settings: Settings;
  preset: PresetName;
  notes: string[];
  members: MemberView[];
}

export interface ChatMessage {
  id: number;
  from: string;
  name: string;
  role: Role;
  text: string;
  at: number;
}

type WithoutPlayer<T> = T extends unknown ? Omit<T, 'player'> : never;

export type ClientAction = WithoutPlayer<PlayerAction>;

export type LobbyOp =
  | { op: 'settings'; settings: Settings }
  | { op: 'preset'; preset: 'classic' | 'quick' }
  | { op: 'map'; mapId: string }
  | { op: 'appearance'; color?: string; shape?: string; name?: string }
  | { op: 'start' }
  | { op: 'rematch' }
  | { op: 'kick'; player: string }
  | { op: 'transferHost'; player: string }
  | { op: 'mute'; player: string; muted: boolean }
  | { op: 'pause' }
  | { op: 'resume' }
  | { op: 'endGame' };

export type ClientMessage =
  | { t: 'hello'; token?: string; name?: string; spectate?: boolean }
  | { t: 'action'; id: string; expectedVersion?: number; action: ClientAction }
  | { t: 'lobby'; id: string; op: LobbyOp }
  | { t: 'chat'; text: string }
  | { t: 'sync' };

export type ServerMessage =
  | {
      t: 'welcome';
      you: { id: string; role: Role; token?: string };
      room: RoomView;
      game: GameView | null;
      version: number;
      log: GameEvent[];
      chat: ChatMessage[];
      at: number;
    }
  | { t: 'room'; room: RoomView }
  | { t: 'game'; game: GameView | null; version: number; log: GameEvent[]; at: number }
  | { t: 'patch'; from: number; to: number; ops: PatchOp[]; events: GameEvent[]; at: number }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'reject'; id?: string; code: string; message: string }
  | { t: 'kicked' };
