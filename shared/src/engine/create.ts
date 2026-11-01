import { DECKS } from '../cards.ts';
import { getMap, MAPS } from '../maps/index.ts';
import { shuffle } from '../rng.ts';
import { normalizeSettings } from '../settings.ts';
import type { DeckId, GameState, MapDef, PlayerState, Settings } from '../types.ts';
import { fail, groupStreets, isPropertySpace } from './helpers.ts';
import { syncTimers } from './timers.ts';

export interface NewPlayer {
  id: string;
  name: string;
  color: string;
}

export interface NewGame {
  mapId: string;
  settings: Settings;
  players: NewPlayer[];
  seed: number;
  now: number;
}

function wouldCompleteSet(map: MapDef, owned: Set<number>, index: number): boolean {
  const space = map.spaces[index];
  if (space.kind !== 'street') return false;
  return groupStreets(map, space.group).every((i) => i === index || owned.has(i));
}

function dealProperties(state: GameState, map: MapDef, count: number): void {
  if (count <= 0) return;

  const pool = shuffle(
    state,
    map.spaces.flatMap((s, i) => (isPropertySpace(s) ? [i] : []))
  );
  const price = (i: number) => (map.spaces[i] as { price: number }).price;
  pool.sort((a, b) => price(b) - price(a));

  const hands = new Map<string, { value: number; owned: Set<number> }>();
  for (const p of state.players) hands.set(p.id, { value: 0, owned: new Set() });

  for (let round = 0; round < count; round++) {
    const order = [...state.players].sort((a, b) => hands.get(a.id)!.value - hands.get(b.id)!.value);

    for (const player of order) {
      const hand = hands.get(player.id)!;
      const at = pool.findIndex((i) => !wouldCompleteSet(map, hand.owned, i));
      if (at < 0) continue;

      const [index] = pool.splice(at, 1);
      hand.owned.add(index);
      hand.value += price(index);
      state.props[index] = { owner: player.id, houses: 0, mortgaged: false };
    }
  }
}

export function createGame(input: NewGame): GameState {
  if (!MAPS[input.mapId]) fail('unknownMap', 'That map does not exist.');
  const map = getMap(input.mapId);

  const ids = new Set(input.players.map((p) => p.id));
  if (ids.size !== input.players.length) fail('duplicatePlayer', 'Every player needs a different id.');
  if (input.players.length < 2) fail('notEnoughPlayers', 'You need at least 2 players.');

  const { settings } = normalizeSettings(input.settings, map, input.players.length);
  if (input.players.length > settings.room.maxPlayers) fail('tooManyPlayers', 'There are more players than seats.');

  const holder = { rng: input.seed | 0 };
  const order = shuffle(holder, [...input.players]);

  const players: PlayerState[] = order.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    cash: settings.startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: [],
    laps: 0,
    status: 'active',
    connected: true,
    away: null
  }));

  const decks = {} as Record<DeckId, number[]>;
  for (const deck of Object.keys(DECKS) as DeckId[]) {
    decks[deck] = shuffle(holder, DECKS[deck].cards.map((_, i) => i));
  }

  const jackpotSeed = settings.jackpot.enabled ? settings.jackpot.seed : 0;

  const state: GameState = {
    schema: 1,
    version: 0,
    mapId: map.id,
    settings,
    rng: holder.rng,
    status: 'playing',
    players,
    turn: {
      player: players[0].id,
      phase: 'preRoll',
      doubles: 0,
      rolls: 0,
      canRollAgain: false,
      lastRoll: null,
      pendingBuy: null,
      number: 1
    },
    round: 1,
    props: map.spaces.map((s) => (isPropertySpace(s) ? { owner: null, houses: 0, mortgaged: false } : null)),
    decks,
    lastCard: null,
    jackpot: jackpotSeed,
    auction: null,
    auctionQueue: [],
    debts: [],
    trades: [],
    nextTradeId: 1,
    timers: { step: null, pausedAt: null },
    initialMoney: settings.startingCash * players.length,
    bankNet: jackpotSeed,
    winners: [],
    log: []
  };

  dealProperties(state, map, settings.dealtProperties);
  syncTimers(state, input.now);

  return state;
}
