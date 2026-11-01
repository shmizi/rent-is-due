import { describe, expect, it } from 'vitest';
import { DECKS } from '../src/cards.ts';
import { MAPS } from '../src/maps/index.ts';
import { act, newGame, own, player, setDice, types } from './support.ts';

function wildcardOnTop(state: ReturnType<typeof newGame>, title: string): void {
  const index = DECKS.wildcard.cards.findIndex((c) => c.title === title);
  state.decks.wildcard = [index, ...state.decks.wildcard.filter((i) => i !== index)];
}

describe('world cards', () => {
  it('sends a player to a named city and pays salary on the way past Start', () => {
    const state = newGame(2, undefined, 'world');
    player(state, 'p1').position = 30;
    wildcardOnTop(state, 'Another Coalition Meeting');
    setDice(state, [1, 2]);

    const events = act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').position).toBe(MAPS.world.spaces.findIndex((s) => s.name === 'Jerusalem'));
    expect(types(events)).toContain('salary');
    expect(player(state, 'p1').cash).toBe(1700);
    expect(state.turn.phase).toBe('buyDecision');
  });

  it('moves back without salary on Bengaluru Traffic', () => {
    const state = newGame(2, undefined, 'world');
    player(state, 'p1').position = 4;
    wildcardOnTop(state, 'Bengaluru Traffic');
    setDice(state, [1, 2]);

    const events = act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').position).toBe(4);
    expect(types(events)).not.toContain('salary');
  });

  it('rolls fresh dice for the utility card', () => {
    const state = newGame(2, undefined, 'world');
    player(state, 'p1').position = 4;
    own(state, 'p2', [12]);
    wildcardOnTop(state, 'Connected, No Internet');
    setDice(state, [1, 2, 6, 6]);

    const events = act(state, { type: 'roll', player: 'p1' });

    expect(player(state, 'p1').position).toBe(12);
    expect(events.filter((e) => e.type === 'rolled').map((e) => e.detail)).toEqual(['1+2', '6+6']);
    expect(player(state, 'p1').cash).toBe(1500 - 120);
    expect(player(state, 'p2').cash).toBe(1500 + 120);
  });

  it('has every city the cards name on both world maps', () => {
    const named = Object.values(DECKS).flatMap((d) => d.cards.flatMap((c) => (c.effect.type === 'advanceTo' ? [c.effect.space] : [])));
    for (const map of [MAPS.world, MAPS.worldTour]) {
      for (const name of named) expect(map.spaces.some((s) => s.name === name), `${map.id} ${name}`).toBe(true);
    }
  });
});
