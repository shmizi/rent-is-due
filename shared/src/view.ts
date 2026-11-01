import type { DeckId, GameEvent, GameState, PlayerId } from './types.ts';

export type GameView = Omit<GameState, 'rng' | 'decks' | 'log'> & {
  decks: Record<DeckId, number>;
};

const PRIVATE_EVENTS = new Set(['tradeProposed', 'tradeDeclined', 'tradeCancelled', 'tradeCountered']);

export function gameView(state: GameState, viewer: PlayerId | null): GameView {
  const { rng: _rng, decks, log: _log, ...rest } = state;

  return {
    ...rest,
    decks: { dispatch: decks.dispatch.length, wildcard: decks.wildcard.length },
    trades: rest.trades.filter((t) => viewer !== null && (t.from === viewer || t.to === viewer))
  };
}

export function visibleEvents(events: GameEvent[], viewer: PlayerId | null): GameEvent[] {
  return events.filter((e) => !PRIVATE_EVENTS.has(e.type) || (viewer !== null && (e.player === viewer || e.target === viewer)));
}
