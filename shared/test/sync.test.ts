import { describe, expect, it } from 'vitest';
import { applyPatch, diff } from '../src/sync.ts';
import { gameView, visibleEvents } from '../src/view.ts';
import { makeRand, simulateGame } from '../sim/harness.ts';
import { act, newGame, own } from './support.ts';

function randomValue(rand: () => number, depth: number): unknown {
  const roll = rand();
  if (depth <= 0 || roll < 0.3) return [null, true, false, Math.floor(rand() * 100), `s${Math.floor(rand() * 5)}`][Math.floor(rand() * 5)];
  if (roll < 0.6) return Array.from({ length: Math.floor(rand() * 4) }, () => randomValue(rand, depth - 1));

  const out: Record<string, unknown> = {};
  for (let i = 0; i < Math.floor(rand() * 5); i++) out[`k${Math.floor(rand() * 6)}`] = randomValue(rand, depth - 1);
  return out;
}

describe('patches', () => {
  it('turns one value into another for 2,000 random pairs', () => {
    const rand = makeRand(5);
    for (let i = 0; i < 2000; i++) {
      const a = randomValue(rand, 4);
      const b = randomValue(rand, 4);
      expect(applyPatch(structuredClone(a), diff(a, b))).toEqual(b);
    }
  });

  it('sends nothing when nothing changed', () => {
    const state = newGame();
    expect(diff(gameView(state, 'p1'), gameView(structuredClone(state), 'p1'))).toEqual([]);
  });

  it('follows a whole simulated game step by step', () => {
    const result = simulateGame({ seed: 3, players: 3, maxActions: 400 });
    const final = result.finalState;
    const start = newGame(3);
    const patched = applyPatch(structuredClone(gameView(start, 'p1')), diff(gameView(start, 'p1'), gameView(final, 'p1')));
    expect(patched).toEqual(gameView(final, 'p1'));
  });
});

describe('player views', () => {
  it('hides the deck order and the random state', () => {
    const view = gameView(newGame(), 'p1') as unknown as Record<string, unknown>;
    expect(view.rng).toBeUndefined();
    expect(view.log).toBeUndefined();
    expect(view.decks).toEqual({ dispatch: 16, wildcard: 16 });
  });

  it('shows a pending trade only to its two players', () => {
    const state = newGame(3);
    own(state, 'p1', [1]);
    const events = act(state, { type: 'proposeTrade', player: 'p1', to: 'p2', give: { properties: [1], cash: 0, jailCards: 0 }, get: { properties: [], cash: 10, jailCards: 0 } });

    expect(gameView(state, 'p1').trades.length).toBe(1);
    expect(gameView(state, 'p2').trades.length).toBe(1);
    expect(gameView(state, 'p3').trades.length).toBe(0);
    expect(gameView(state, null).trades.length).toBe(0);

    expect(visibleEvents(events, 'p3').map((e) => e.type)).not.toContain('tradeProposed');
    expect(visibleEvents(events, 'p2').map((e) => e.type)).toContain('tradeProposed');
  });
});
