import { describe, expect, it } from 'vitest';
import { CLASSIC, QUICK } from '../src/settings.ts';
import { simulateGame } from '../sim/harness.ts';

describe('simulated games', () => {
  it('keeps every invariant through 300 bot games, and nearly all end on their own', () => {
    let endedByHost = 0;

    for (let seed = 1; seed <= 300; seed++) {
      const settings = structuredClone(seed % 3 === 0 ? QUICK : CLASSIC);
      if (seed % 5 === 0) settings.bankruptProperties = 'auction';
      if (seed % 7 === 0) settings.jackpot.enabled = true;

      const result = simulateGame({ seed, players: 2 + (seed % 5), settings, chaos: seed % 4 === 0, checkInvariants: true });

      expect(result.stalled, `seed ${seed} stalled`).toBe(false);
      expect(result.finished || result.endedByHost, `seed ${seed} did not end`).toBe(true);
      expect(result.finalState.status).toBe('finished');
      if (result.endedByHost) endedByHost++;
    }

    expect(endedByHost).toBeLessThanOrEqual(3);
  });

  it('never changes the state when an action is rejected', () => {
    for (let seed = 1000; seed < 1030; seed++) {
      const result = simulateGame({ seed, players: 4, settings: structuredClone(CLASSIC), chaos: true, checkInvariants: true, checkRejections: true });
      expect(result.finished).toBe(true);
    }
  });

  it('produces the same game from the same seed', () => {
    const a = simulateGame({ seed: 77, players: 4 });
    const b = simulateGame({ seed: 77, players: 4 });
    expect(JSON.stringify(a.finalState)).toBe(JSON.stringify(b.finalState));
  });
});
