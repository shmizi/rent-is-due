import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { DECKS } from '../../../shared/src/cards.ts';
import type { DeckId, GameEvent } from '../../../shared/src/types.ts';
import { cardOf, nameOf } from '../lib/format.ts';
import { memberLook } from '../lib/game.ts';
import { Token } from '../ui/kit.tsx';
import { AuctionPanel } from './Panels.tsx';
import { useGame } from './useGame.ts';

interface Drawn {
  key: number;
  event: GameEvent;
  roll: string | undefined;
}

function latestCard(events: GameEvent[]): { event: GameEvent; roll: string | undefined } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type !== 'card') continue;
    const roll = events.slice(i + 1).find((e) => e.type === 'rolled' && e.player === event.player)?.detail;
    return { event, roll };
  }
  return null;
}

export function CardReveal() {
  const { state, game, room, you } = useGame();
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const count = useRef(0);

  useEffect(() => {
    const found = latestCard(state.lastEvents);
    if (found) setDrawn({ key: ++count.current, ...found });
  }, [state.lastEvents]);

  useEffect(() => {
    if (!drawn) return;
    const timer = setTimeout(() => setDrawn(null), 10_000);
    return () => clearTimeout(timer);
  }, [drawn]);

  const card = drawn ? cardOf(drawn.event.detail) : null;
  const deck = drawn?.event.detail?.split(':')[0] as DeckId | undefined;
  const who = drawn?.event.player;

  return (
    <div className="card-reveal-layer" aria-live="polite">
      <AnimatePresence>
        {drawn && card && deck && who && (
          <motion.button
            type="button"
            key={drawn.key}
            className="card-reveal glass"
            data-deck={deck}
            onClick={() => setDrawn(null)}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <span className="card-reveal-head">
              <Token {...memberLook(room.members, who)} label={nameOf(game, who).charAt(0).toUpperCase()} size={24} />
              <span>{who === you.id ? 'You drew' : `${nameOf(game, who)} drew`}</span>
              <span className="card-reveal-deck">{DECKS[deck].name}</span>
            </span>
            <span className="card-reveal-title">{card.title}</span>
            <span className="card-reveal-text">{card.text}</span>
            <span className="card-reveal-action">{card.action}</span>
            {drawn.roll && <span className="card-reveal-roll">Rolled {drawn.roll.replace('+', ' + ')}</span>}
            <span className="card-reveal-hint">Tap to close</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AuctionPopup({ hidden, onHide }: { hidden: boolean; onHide: () => void }) {
  const { game } = useGame();
  const auction = game.auction;

  return (
    <AnimatePresence>
      {auction && !hidden && (
        <motion.div
          key={auction.id}
          className="auction-pop-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-label="Auction"
            className="auction-pop glass"
            initial={{ y: 24, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          >
            <AuctionPanel onHide={onHide} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
