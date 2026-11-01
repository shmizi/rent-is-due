import { applyAction } from '../src/engine/apply.ts';
import { MAPS } from '../src/maps/index.ts';
import { HARBORVIEW } from '../src/maps/harborview.ts';
import { createGame } from '../src/engine/create.ts';
import { rollDie } from '../src/rng.ts';
import { CLASSIC } from '../src/settings.ts';
import type { Action, GameEvent, GameState, PlayerState, Settings } from '../src/types.ts';

export const T0 = 1_800_000_000_000;

MAPS.harborview = HARBORVIEW;

export function newGame(players = 2, change?: (s: Settings) => void, mapId = 'harborview'): GameState {
  const settings = structuredClone(CLASSIC);
  change?.(settings);

  const state = createGame({
    mapId,
    settings,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: '#000000' })),
    seed: 42,
    now: T0
  });

  state.players.sort((a, b) => a.id.localeCompare(b.id));
  state.turn.player = 'p1';
  return state;
}

export function player(state: GameState, id: string): PlayerState {
  return state.players.find((p) => p.id === id)!;
}

export function act(state: GameState, action: Action, now = T0): GameEvent[] {
  return applyAction(state, action, now);
}

export function own(state: GameState, owner: string, spaces: number[], houses = 0): void {
  for (const i of spaces) state.props[i] = { owner, houses, mortgaged: false };
}

export function ownEverything(state: GameState, owner: string): void {
  state.props.forEach((prop, i) => {
    if (prop) state.props[i] = { owner, houses: 0, mortgaged: false };
  });
}

// finds a generator seed whose next rolls are exactly the given dice faces
export function setDice(state: GameState, faces: number[]): void {
  for (let seed = 1; seed < 50_000_000; seed++) {
    const probe = { rng: seed };
    if (faces.every((f) => rollDie(probe) === f)) {
      state.rng = seed;
      return;
    }
  }
  throw new Error(`No seed found for dice ${faces.join(',')}`);
}

export function types(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}
