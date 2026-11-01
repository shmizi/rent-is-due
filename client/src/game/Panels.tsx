import { useState } from 'react';
import { clock, describe, money, nameOf, spaceName } from '../lib/format.ts';
import { mapFor, memberLook, mortgageValue, ownedBy, setHasBuildings, worth } from '../lib/game.ts';
import { useNow, useRoom } from '../net/useRoom.ts';
import { Button, Confirm, Panel, Token } from '../ui/kit.tsx';
import { useGame } from './useGame.ts';
import type { TradeOffer } from '../../../shared/src/types.ts';

export function AuctionPanel() {
  const { game, me, connection } = useGame();
  const now = useNow(250);
  const [custom, setCustom] = useState('');
  const auction = game.auction;
  if (!auction) return null;

  const space = mapFor(game).spaces[auction.space];
  const price = 'price' in space ? space.price : 0;
  const bidding = !!me && auction.bidders.includes(me.id);
  const leading = auction.highBidder === me?.id;
  const bid = (amount: number) => connection.act({ type: 'bid', amount });

  return (
    <Panel title="Auction" right={<span className="money text-sm font-semibold text-amber">{clock(auction.deadline - now)}</span>}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xl font-semibold">{spaceName(game, auction.space)}</span>
        <span className="text-xs text-muted">listed at {money(price)}</span>
      </div>
      <p className="mt-1 text-sm text-soft">{auction.highBidder ? `Top bid ${money(auction.highBid)} by ${leading ? 'you' : nameOf(game, auction.highBidder)}` : 'No bids yet. Start the bidding.'}</p>
      <p className="mt-1 text-xs text-muted">Still in: {auction.bidders.map((b) => (b === me?.id ? 'you' : nameOf(game, b))).join(', ')}</p>

      {bidding && !leading && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[1, 10, 50].map((step) => (
              <Button key={step} tone={step === 10 ? 'primary' : 'secondary'} onClick={() => bid(auction.highBid + step)} disabled={auction.highBid + step > (me?.cash ?? 0)}>
                {money(auction.highBid + step)}
              </Button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Math.round(Number(custom));
              if (n > 0) bid(n);
              setCustom('');
            }}
          >
            <input type="number" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Your bid" aria-label="Custom bid" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3" />
            <Button type="submit">Bid</Button>
            <Button tone="danger" onClick={() => connection.act({ type: 'dropOut' })}>
              Drop out
            </Button>
          </form>
        </>
      )}
      {leading && <p className="mt-3 text-sm font-semibold text-mint">You have the top bid. Hold on.</p>}
      {!bidding && me && <p className="mt-3 text-sm text-muted">You’re not in this auction.</p>}
    </Panel>
  );
}

export function DebtPanel() {
  const { game, me, connection } = useGame();
  const [confirming, setConfirming] = useState(false);
  if (!me) return null;

  const mine = game.debts.filter((d) => d.debtor === me.id);
  if (mine.length === 0) return null;

  const owed = mine.reduce((a, d) => a + d.amount, 0);
  const map = mapFor(game);
  const props = ownedBy(game, me.id);
  const sellable = props.filter((i) => (game.props[i]?.houses ?? 0) > 0);
  const mortgageable = props.filter((i) => !game.props[i]?.mortgaged && !setHasBuildings(game, i));

  return (
    <Panel title="You owe money" className="border-danger/60">
      <p className="text-sm text-soft">
        You owe {mine.map((d) => `${money(d.amount)} to ${d.creditor.kind === 'player' ? nameOf(game, d.creditor.id) : d.creditor.kind === 'jackpot' ? 'the jackpot' : 'the bank'}`).join(' and ')}. You have{' '}
        <span className="money font-semibold text-gold">{money(me.cash)}</span>. The game waits until you raise <span className="font-semibold">{money(owed - me.cash)}</span> more.
      </p>

      {sellable.length > 0 && <p className="mt-3 text-xs font-semibold text-muted">Sell buildings (half price back)</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {sellable.map((i) => (
          <Button key={i} size="sm" onClick={() => connection.act({ type: 'sellBuilding', space: i })}>
            {map.spaces[i].name}
          </Button>
        ))}
      </div>

      {mortgageable.length > 0 && <p className="mt-3 text-xs font-semibold text-muted">Mortgage</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {mortgageable.map((i) => (
          <Button key={i} size="sm" onClick={() => connection.act({ type: 'mortgage', space: i })}>
            {map.spaces[i].name} +{money(mortgageValue(game, i))}
          </Button>
        ))}
      </div>

      <Button tone="danger" className="mt-4 w-full" onClick={() => setConfirming(true)}>
        Declare bankruptcy
      </Button>
      {confirming && (
        <Confirm
          title="Declare bankruptcy?"
          body="You’ll be out of the game. Your cash and properties go to whoever you owe, or back to the bank."
          action="Go bankrupt"
          onConfirm={() => connection.act({ type: 'declareBankruptcy' })}
          onClose={() => setConfirming(false)}
        />
      )}
    </Panel>
  );
}

function bundleText(game: ReturnType<typeof useGame>['game'], bundle: TradeOffer['give']): string {
  const parts = bundle.properties.map((i) => spaceName(game, i));
  if (bundle.cash > 0) parts.push(money(bundle.cash));
  if (bundle.jailCards > 0) parts.push(`${bundle.jailCards} get-out card${bundle.jailCards > 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

export function TradesPanel({ onCompose, onCounter }: { onCompose: () => void; onCounter: (offer: TradeOffer) => void }) {
  const { game, me, active, connection } = useGame();
  if (!me || !active) return null;

  const incoming = game.trades.filter((t) => t.to === me.id);
  const outgoing = game.trades.filter((t) => t.from === me.id);

  return (
    <Panel title="Trades" right={game.settings.trading && <Button size="sm" onClick={onCompose}>New offer</Button>}>
      {!game.settings.trading && <p className="text-sm text-muted">Trading is off in this game.</p>}
      {game.settings.trading && incoming.length + outgoing.length === 0 && <p className="text-sm text-muted">No open offers.</p>}

      <div className="flex flex-col gap-3">
        {incoming.map((t) => (
          <div key={t.id} className="rounded-xl border border-line p-3">
            <p className="mb-2 text-xs font-semibold text-muted">From {nameOf(game, t.from)}</p>
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <span className="block text-[11px] text-muted">You get</span>
                {bundleText(game, t.give)}
              </div>
              <div>
                <span className="block text-[11px] text-muted">You give</span>
                {bundleText(game, t.get)}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" tone="primary" className="flex-1" onClick={() => connection.act({ type: 'acceptTrade', trade: t.id })}>
                Accept
              </Button>
              <Button size="sm" className="flex-1" onClick={() => onCounter(t)}>
                Counter
              </Button>
              <Button size="sm" tone="danger" className="flex-1" onClick={() => connection.act({ type: 'declineTrade', trade: t.id })}>
                Decline
              </Button>
            </div>
          </div>
        ))}

        {outgoing.map((t) => (
          <div key={t.id} className="rounded-xl border border-dashed border-line p-3 text-[13px]">
            <p className="mb-1 text-xs font-semibold text-muted">Waiting for {nameOf(game, t.to)}</p>
            <p>
              You give {bundleText(game, t.give)}, you get {bundleText(game, t.get)}.
            </p>
            <Button size="sm" tone="ghost" className="mt-2" onClick={() => connection.act({ type: 'cancelTrade', trade: t.id })}>
              Withdraw
            </Button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function LogPanel({ className = '' }: { className?: string }) {
  const { log } = useRoom();
  const { game, room } = useGame();
  const lines = log
    .map((event, i) => ({ event, i, text: describe(event, game) }))
    .filter((l) => l.text && l.event.type !== 'rolled')
    .reverse()
    .slice(0, 60);

  return (
    <div className={`min-h-0 space-y-1.5 overflow-y-auto pr-1 ${className}`}>
      {lines.length === 0 && <p className="text-sm text-muted">Nothing has happened yet.</p>}
      {lines.map(({ event, i, text }) => (
        <p key={i} className="flex gap-2 text-[13px] text-soft">
          <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: event.player ? memberLook(room.members, event.player).color : '#5B6190' }} />
          <span>{text}</span>
        </p>
      ))}
    </div>
  );
}

export function GameOver() {
  const { game, room, isHost, connection } = useGame();
  const score = (p: (typeof game.players)[number]) => (game.winners.includes(p.id) ? 2 : p.status === 'active' ? 1 : 0);
  const ranking = [...game.players].sort((a, b) => score(b) - score(a) || (b.status === 'active' ? worth(game, b.id) : 0) - (a.status === 'active' ? worth(game, a.id) : 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#060814]/75 p-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-6 text-center">
        <p className="text-sm font-semibold text-muted">Game over</p>
        <h2 className="mt-1 font-display text-3xl font-semibold">{game.winners.map((w) => nameOf(game, w)).join(' and ')} won</h2>
        <ul className="mt-5 flex flex-col gap-2 text-left">
          {ranking.map((p) => {
            const look = memberLook(room.members, p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl bg-raised px-3 py-2">
                <Token color={look.color} shape={look.shape} label={p.name.charAt(0)} size={28} />
                <span className="flex-1 font-semibold">{p.name}</span>
                <span className="flex flex-col items-end">
                  {p.status === 'active' && <span className="money text-sm font-semibold text-gold">worth {money(worth(game, p.id))}</span>}
                  <span className="text-xs text-muted">{game.winners.includes(p.id) ? 'Winner' : p.status === 'active' ? 'Still standing' : p.status === 'bankrupt' ? 'Bankrupt' : 'Left'}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {isHost ? (
          <Button tone="primary" size="lg" className="mt-6 w-full" onClick={() => connection.lobby({ op: 'rematch' })}>
            Back to the lobby for a rematch
          </Button>
        ) : (
          <p className="mt-6 text-sm text-muted">The host can start a rematch.</p>
        )}
      </div>
    </div>
  );
}
