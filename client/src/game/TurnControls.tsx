import { motion } from 'motion/react';
import type { ClientAction } from '../../../shared/src/protocol.ts';
import type { GameView } from '../../../shared/src/view.ts';
import { clock, money, nameOf, spaceName } from '../lib/format.ts';
import { mapFor, playerById } from '../lib/game.ts';
import { useNow } from '../net/useRoom.ts';
import { Button } from '../ui/kit.tsx';
import { useGame } from './useGame.ts';

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function Dice({ size = 56 }: { size?: number | string }) {
  const { game } = useGame();
  const roll = game.turn.lastRoll ?? [1, 1];
  const key = `${game.turn.number}-${game.turn.rolls}`;

  return (
    <div className="flex gap-3">
      {roll.map((face, d) => (
        <motion.div
          key={`${key}-${d}`}
          initial={game.turn.lastRoll ? { rotate: d ? -200 : 200, scale: 0.6 } : false}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          className="grid grid-cols-3 grid-rows-3 gap-[3px] rounded-[22%] bg-white shadow-[0_4px_0_#B4BAD8,0_6px_14px_rgba(0,0,0,.35)]"
          style={{ width: size, height: size, padding: typeof size === 'number' ? size * 0.15 : `calc(${size} * 0.15)`, opacity: game.turn.lastRoll ? 1 : 0.45 }}
          aria-label={`Die showing ${face}`}
          role="img"
        >
          {Array.from({ length: 9 }, (_, c) => (
            <span key={c} className="rounded-full" style={{ background: PIPS[face].includes(c) ? '#1D1B2E' : 'transparent' }} />
          ))}
        </motion.div>
      ))}
    </div>
  );
}

interface Choice {
  label: string;
  action: ClientAction;
  tone: 'primary' | 'secondary';
}

export function useTurnPrompt(): { title: string; sub: string; choices: Choice[]; timer: string | null } {
  const { game, me, you } = useGame();
  const now = useNow();
  const s = game.settings;
  const current = playerById(game, game.turn.player);
  const step = game.timers.step;
  const timer = step?.deadline ? clock(step.deadline - now) : null;

  if (game.status === 'finished') return { title: 'Game over', sub: '', choices: [], timer: null };
  if (game.timers.pausedAt !== null) return { title: 'Paused', sub: 'The host paused the game', choices: [], timer: null };

  if (game.auction) {
    return { title: `Auction: ${spaceName(game, game.auction.space)}`, sub: game.auction.highBidder ? `Top bid ${money(game.auction.highBid)} by ${nameOf(game, game.auction.highBidder)}` : 'No bids yet', choices: [], timer: null };
  }

  const mine = game.debts.filter((d) => d.debtor === you.id);
  if (mine.length > 0) {
    return { title: `You owe ${money(mine.reduce((a, d) => a + d.amount, 0))}`, sub: 'Mortgage, sell buildings or trade to raise it', choices: [], timer: null };
  }
  if (game.debts.length > 0) {
    const debt = game.debts[0];
    return { title: `${nameOf(game, debt.debtor)} owes ${money(debt.amount)}`, sub: 'Waiting while they raise the cash', choices: [], timer: null };
  }

  const leave: Choice[] = [];
  if (me?.status === 'active' && me.inJail) {
    if (me.cash >= s.jailFine) leave.push({ label: `Pay ${money(s.jailFine)} to leave`, action: { type: 'payJailFine' }, tone: 'secondary' });
    if (me.jailCards.length > 0) leave.push({ label: 'Use card', action: { type: 'useJailCard' }, tone: 'secondary' });
  }

  if (!me || game.turn.player !== me.id) {
    const away = current && !current.connected;
    return { title: `${current?.name ?? 'Someone'}’s turn`, sub: away ? 'They’re away. The game waits for them.' : leave.length ? 'You can pay to leave the Visa Office now' : 'Waiting for their move', choices: leave, timer };
  }

  const turn = game.turn;

  if (turn.phase === 'preRoll' && me.inJail) {
    const last = me.jailTurns + 1 >= s.maxJailTurns;
    return { title: 'You’re stuck at the Visa Office', sub: `Attempt ${me.jailTurns + 1} of ${s.maxJailTurns}${last ? '. No doubles and you’re let out free.' : ''}`, choices: [{ label: 'Roll for doubles', action: { type: 'roll' }, tone: 'primary' }, ...leave], timer };
  }

  if (turn.phase === 'preRoll') return { title: 'Your turn', sub: 'Build or trade first if you like', choices: [{ label: 'Roll dice', action: { type: 'roll' }, tone: 'primary' }], timer };

  if (turn.phase === 'buyDecision' && turn.pendingBuy !== null) {
    const space = spaceName(game, turn.pendingBuy);
    const price = priceOf(game, turn.pendingBuy);
    return {
      title: `Buy ${space}?`,
      sub: me.cash >= price ? `You have ${money(me.cash)}` : `You have ${money(me.cash)}. Mortgage something first to afford it.`,
      choices: [
        { label: `Buy for ${money(price)}`, action: { type: 'buy' }, tone: 'primary' },
        { label: s.auctions ? 'Pass and auction' : 'Pass', action: { type: 'decline' }, tone: 'secondary' }
      ],
      timer
    };
  }

  if (turn.canRollAgain) return { title: 'Doubles!', sub: 'Roll again', choices: [{ label: 'Roll again', action: { type: 'roll' }, tone: 'primary' }], timer };

  return { title: 'Your move is done', sub: 'Build, trade or end your turn', choices: [{ label: 'End turn', action: { type: 'endTurn' }, tone: 'primary' }, ...leave], timer };
}

function priceOf(game: GameView, index: number): number {
  const space = mapFor(game).spaces[index];
  return 'price' in space ? space.price : 0;
}

export function TurnControls({ compact = false }: { compact?: boolean }) {
  const { connection } = useGame();
  const prompt = useTurnPrompt();

  return (
    <div className={`flex flex-col items-center gap-2 text-center ${compact ? '' : 'gap-3'}`}>
      <div className="flex flex-col gap-0.5">
        <span className={`font-display font-semibold ${compact ? 'text-lg' : 'text-[22px]'}`}>{prompt.title}</span>
        {prompt.sub && <span className={`text-sm ${compact ? 'text-muted' : 'text-board-sub'}`}>{prompt.sub}</span>}
      </div>
      {prompt.choices.length > 0 && (
        <div className="flex w-full flex-wrap justify-center gap-2">
          {prompt.choices.map((c) => (
            <Button key={c.label} tone={c.tone === 'primary' ? 'primary' : 'secondary'} size="lg" className={compact ? 'flex-1' : ''} onClick={() => connection.act(c.action)}>
              {c.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
