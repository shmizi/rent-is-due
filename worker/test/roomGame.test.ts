import { describe, expect, it } from 'vitest';
import { CLASSIC, QUICK } from '../../shared/src/settings.ts';
import { playRoomGame } from './botRoom.ts';

describe('whole games through the room', () => {
  it('plays a 6-player game with drops, a spectator and restarts mid-auction and mid-debt', async () => {
    const result = await playRoomGame({ seed: 11, players: 6, settings: structuredClone(CLASSIC), chaos: true, restarts: true, checkMirrors: true });

    expect(result.restarts).toEqual({ auction: true, debt: true });
    expect(result.drops).toBeGreaterThan(0);
    expect(result.finished || result.endedByHost).toBe(true);
  }, 120_000);

  it('keeps every client in sync across 8 more games', async () => {
    for (let seed = 20; seed < 28; seed++) {
      const settings = structuredClone(seed % 2 === 0 ? QUICK : CLASSIC);
      const result = await playRoomGame({ seed, players: 2 + (seed % 5), settings, chaos: true, restarts: true, checkMirrors: true });
      expect(result.finished || result.endedByHost, `seed ${seed}`).toBe(true);
    }
  }, 300_000);
});
