import { describe, expect, it } from 'vitest';
import { DECKS } from '../src/cards.ts';
import { checkMap } from '../src/maps/checkMap.ts';
import { HARBORVIEW } from '../src/maps/harborview.ts';
import { groupStreets } from '../src/engine/helpers.ts';
import { CLASSIC, normalizeSettings, QUICK } from '../src/settings.ts';
import type { MapDef } from '../src/types.ts';
import { newGame } from './support.ts';

describe('Harborview map', () => {
  it('passes the map checker', () => {
    expect(checkMap(HARBORVIEW, DECKS)).toEqual([]);
  });

  it('has the rent ladder the map file describes', () => {
    const crown = HARBORVIEW.spaces[39];
    expect(crown.kind === 'street' && crown.rents).toEqual([28, 140, 390, 895, 1175, 1455]);

    const mudflat = HARBORVIEW.spaces[1];
    expect(mudflat.kind === 'street' && mudflat.rents).toEqual([4, 20, 55, 130, 170, 210]);
  });

  it('catches a broken map', () => {
    const broken: MapDef = structuredClone(HARBORVIEW);
    broken.spaces[5] = { kind: 'free', name: 'Extra plaza' };
    broken.spaces[39] = { kind: 'street', name: 'Kelp Park', group: 'navy', price: 10, rents: [5, 4, 3, 2, 1, 0] };

    const errors = checkMap(broken, DECKS).join('\n');
    expect(errors).toContain('exactly one free space');
    expect(errors).toContain('4 transit stops');
    expect(errors).toContain('rents must increase');
    expect(errors).toContain('used twice');
    expect(errors).toContain('cheaper than the group before it');
  });
});

describe('settings', () => {
  it('turns off three doubles when doubles do not roll again', () => {
    const input = { ...structuredClone(CLASSIC), rollAgainOnDoubles: false };
    const { settings, notes } = normalizeSettings(input, HARBORVIEW);
    expect(settings.threeDoublesJail).toBe(false);
    expect(notes.length).toBe(1);
  });

  it('frees bankrupt property when auctions are off', () => {
    const input = { ...structuredClone(CLASSIC), auctions: false, bankruptProperties: 'auction' as const };
    expect(normalizeSettings(input, HARBORVIEW).settings.bankruptProperties).toBe('unowned');
  });

  it('caps dealt properties by player count', () => {
    const input = { ...structuredClone(CLASSIC), dealtProperties: 5 };
    expect(normalizeSettings(input, HARBORVIEW, 6).settings.dealtProperties).toBe(2);
    expect(normalizeSettings(input, HARBORVIEW, 2).settings.dealtProperties).toBe(5);
  });

  it('raises a net worth target below twice the starting cash', () => {
    const input = { ...structuredClone(CLASSIC), win: { mode: 'netWorth' as const, target: 1000 } };
    expect(normalizeSettings(input, HARBORVIEW).settings.win).toEqual({ mode: 'netWorth', target: 3000 });
  });

  it('keeps the round limit at 5 or more and seats within the map', () => {
    const input = structuredClone(CLASSIC);
    input.win = { mode: 'rounds', rounds: 2 };
    input.room.maxPlayers = 12;
    const { settings } = normalizeSettings(input, HARBORVIEW);
    expect(settings.win).toEqual({ mode: 'rounds', rounds: 5 });
    expect(settings.room.maxPlayers).toBe(8);
  });

  it('turns off spectator chat without spectators and warns about an empty jackpot', () => {
    const input = structuredClone(CLASSIC);
    input.room.spectators = false;
    input.jackpot = { enabled: true, taxes: false, cardFines: false, jailFines: false, seed: 0 };
    const { settings, notes } = normalizeSettings(input, HARBORVIEW);
    expect(settings.room.spectatorChat).toBe(false);
    expect(notes.join(' ')).toContain('only the seed money');
  });
});

describe('dealing properties', () => {
  it('deals each player a balanced hand with no full set', () => {
    const state = newGame(4, (s) => Object.assign(s, structuredClone(QUICK)));
    const hands = state.players.map((p) => state.props.flatMap((prop, i) => (prop?.owner === p.id ? [i] : [])));

    for (const hand of hands) expect(hand.length).toBe(2);

    for (const group of Object.keys(HARBORVIEW.groups)) {
      const owners = new Set(groupStreets(HARBORVIEW, group).map((i) => state.props[i]!.owner));
      expect(owners.size === 1 && !owners.has(null)).toBe(false);
    }

    const values = hands.map((h) => h.reduce((sum, i) => sum + (HARBORVIEW.spaces[i] as { price: number }).price, 0));
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(200);
  });
});
