import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { clock, money } from '../lib/format.ts';
import { memberLook, worth } from '../lib/game.ts';
import { useNow } from '../net/useRoom.ts';
import { Button, Token } from '../ui/kit.tsx';
import { useGame } from './useGame.ts';

function useCashDeltas(cash: Record<string, number>) {
  const previous = useRef(cash);
  const [deltas, setDeltas] = useState<{ id: string; amount: number; key: number }[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const changes = Object.keys(cash)
      .filter((id) => previous.current[id] !== undefined && previous.current[id] !== cash[id])
      .map((id) => ({ id, amount: cash[id] - previous.current[id], key: ++counter.current }));
    previous.current = cash;
    if (changes.length === 0) return;

    setDeltas((d) => [...d, ...changes]);
    const keys = new Set(changes.map((c) => c.key));
    setTimeout(() => setDeltas((d) => d.filter((x) => !keys.has(x.key))), 1600);
  }, [cash]);

  return deltas;
}

export function PlayersPanel() {
  const { game, room, you, isHost, connection } = useGame();
  const now = useNow(1000);
  const cash = Object.fromEntries(game.players.map((p) => [p.id, p.cash]));
  const deltas = useCashDeltas(cash);
  const meActive = game.players.some((p) => p.id === you.id && p.status === 'active' && p.connected);

  return (
    <ul className="flex flex-col gap-1">
      {game.players.map((p) => {
        const look = memberLook(room.members, p.id);
        const current = game.turn.player === p.id && game.status === 'playing';
        const out = p.status !== 'active';
        let status = current ? (p.id === you.id ? 'Your turn' : 'Playing') : 'Waiting';
        let statusColor = current ? 'text-mint' : 'text-muted';
        if (p.inJail) status = `In Lockup, attempt ${p.jailTurns + 1}`;
        if (p.away) {
          status = `Away, ${clock(p.away.deadline - now)} left to rejoin`;
          statusColor = 'text-amber';
        }
        if (out) {
          status = p.status === 'bankrupt' ? 'Bankrupt' : 'Left the game';
          statusColor = 'text-muted';
        }
        const voted = p.away?.votes.includes(you.id);

        return (
          <li key={p.id} className={`relative flex items-center gap-3 rounded-xl px-2 py-2 ${current ? 'bg-raised' : ''} ${out ? 'opacity-55' : ''}`}>
            <Token color={look.color} shape={look.shape} label={p.name.charAt(0).toUpperCase()} size={32} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">
                {p.name}
                {p.id === you.id && <span className="font-normal text-muted"> (you)</span>}
              </span>
              <span className={`text-xs ${statusColor}`}>{status}</span>
              {p.away && !out && meActive && p.id !== you.id && (
                <Button size="sm" tone="ghost" className="mt-1 self-start border-amber/60 text-amber" disabled={voted} onClick={() => connection.act({ type: 'voteExtend', target: p.id })}>
                  {voted ? 'Voted' : 'Vote +5 min'}
                </Button>
              )}
            </div>
            <div className="relative flex flex-col items-end">
              <span className="money text-[17px] font-semibold text-gold">{money(p.cash)}</span>
              {!out && <span className="text-[11px] text-muted">worth {money(worth(game, p.id))}</span>}
              <AnimatePresence>
                {deltas
                  .filter((d) => d.id === p.id)
                  .map((d) => (
                    <motion.span
                      key={d.key}
                      initial={{ opacity: 0, y: 0 }}
                      animate={{ opacity: 1, y: -18 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5 }}
                      className={`money pointer-events-none absolute right-0 top-0 text-sm font-semibold ${d.amount > 0 ? 'text-mint' : 'text-danger'}`}
                    >
                      {d.amount > 0 ? '+' : ''}
                      {money(d.amount)}
                    </motion.span>
                  ))}
              </AnimatePresence>
            </div>
            {isHost && !out && p.id !== you.id && game.status === 'playing' && <KickButton id={p.id} name={p.name} />}
          </li>
        );
      })}
    </ul>
  );
}

function KickButton({ id, name }: { id: string; name: string }) {
  const { connection } = useGame();
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} aria-label={`Remove ${name}`} className="h-8 rounded-lg px-2 text-xs text-muted hover:bg-raised">
        Remove
      </button>
    );
  }

  return (
    <span className="flex gap-1">
      <button type="button" onClick={() => connection.lobby({ op: 'kick', player: id })} className="h-8 rounded-lg bg-danger/20 px-2 text-xs font-semibold text-danger">
        Remove {name}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="h-8 rounded-lg px-2 text-xs text-muted">
        Keep
      </button>
    </span>
  );
}
