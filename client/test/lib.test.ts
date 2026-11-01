import { describe as group, expect, it } from 'vitest';
import { WORLD } from '../../shared/src/maps/world.ts';
import { CLASSIC, normalizeSettings } from '../../shared/src/settings.ts';
import { gameView } from '../../shared/src/view.ts';
import { simulateGame } from '../../shared/sim/harness.ts';
import { describe, money } from '../src/lib/format.ts';
import { sidePosition } from '../src/lib/game.ts';
import { spaceInfo } from '../src/lib/spaces.ts';
import { SECTIONS } from '../src/lobby/rules.ts';
import { withAliases } from '../src/lib/aliases.ts';
import { createGame } from '../../shared/src/engine/create.ts';

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
        const kept = normalizeSettings(settings, WORLD, 2).settings;
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
    for (let i = 0; i < 40; i++) expect(spaceInfo(game, i).name).toBe(WORLD.spaces[i].name);
  });
});

group('aliases', () => {
  it('renames whoever owns all of Israel, and only while they do', () => {
    const state = createGame({ mapId: 'world', settings: structuredClone(CLASSIC), players: [{ id: 'p1', name: 'Sam', color: '#000' }, { id: 'p2', name: 'Mei', color: '#fff' }], seed: 1, now: 0 });
    const israel = WORLD.spaces.flatMap((s, i) => (s.kind === 'street' && s.group === 'il' ? [i] : []));
    for (const i of israel) state.props[i] = { owner: 'p1', houses: 0, mortgaged: false };

    const named = withAliases(gameView(state, null));
    expect(named.players.find((p) => p.id === 'p1')!.name).toBe('Benjamin Netanyahu');
    expect(named.players.find((p) => p.id === 'p2')!.name).toBe('Mei');

    state.props[israel[0]] = { owner: 'p2', houses: 0, mortgaged: false };
    expect(withAliases(gameView(state, null)).players.find((p) => p.id === 'p1')!.name).toBe('Sam');
  });
});
