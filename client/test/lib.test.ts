import { describe as group, expect, it } from 'vitest';
import { HARBORVIEW } from '../../shared/src/maps/harborview.ts';
import { CLASSIC, normalizeSettings } from '../../shared/src/settings.ts';
import { gameView } from '../../shared/src/view.ts';
import { simulateGame } from '../../shared/sim/harness.ts';
import { describe, money } from '../src/lib/format.ts';
import { sidePosition } from '../src/lib/game.ts';
import { spaceInfo } from '../src/lib/spaces.ts';
import { SECTIONS } from '../src/lobby/rules.ts';

group('lobby rule rows', () => {
  it('reads back every value it writes, and the server keeps it', () => {
    for (const section of SECTIONS) {
      for (const row of section.rows) {
        const settings = structuredClone(CLASSIC);
        settings.jackpot.enabled = true;

        if (row.kind === 'toggle') {
          row.set(settings, !row.get(settings));
        } else if (row.kind === 'select') {
          row.set(settings, row.options[row.options.length - 1].value);
        } else {
          row.set(settings, row.max);
        }

        const before = row.get(settings);
        const kept = normalizeSettings(settings, HARBORVIEW, 2).settings;
        if (!row.blocked?.(kept)) expect(row.get(kept), `${section.id}.${row.id}`).toEqual(before);
      }
    }
  });
});

group('formatting', () => {
  it('writes money with a sign and commas', () => {
    expect(money(1342)).toBe('$1,342');
    expect(money(-300)).toBe('−$300');
  });

  it('turns every event from a simulated game into a sentence', () => {
    const result = simulateGame({ seed: 5, players: 4, chaos: true });
    const game = gameView(result.finalState, null);
    const silent = new Set(['moved', 'restored', 'extendDeadlines']);

    for (const event of result.finalState.log) {
      if (silent.has(event.type)) continue;
      expect(describe(event, game), event.type).toBeTruthy();
    }
  });
});

group('board layout', () => {
  it('places all 40 spaces on the edge without overlaps', () => {
    const cells = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { row, col } = sidePosition(i, 40);
      expect(row === 1 || row === 11 || col === 1 || col === 11).toBe(true);
      cells.add(`${row},${col}`);
    }
    expect(cells.size).toBe(40);
    expect(sidePosition(0, 40)).toEqual({ row: 11, col: 11, side: 'corner' });
    expect(sidePosition(20, 40)).toEqual({ row: 1, col: 1, side: 'corner' });
  });

  it('builds a card for every space', () => {
    const result = simulateGame({ seed: 9, players: 3, maxActions: 300 });
    const game = gameView(result.finalState, null);
    for (let i = 0; i < 40; i++) expect(spaceInfo(game, i).name).toBe(HARBORVIEW.spaces[i].name);
  });
});
