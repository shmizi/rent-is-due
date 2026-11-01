import { useEffect, useState } from 'react';
import type { TradeOffer } from '../../../shared/src/types.ts';
import { clock, money } from '../lib/format.ts';
import { memberLook } from '../lib/game.ts';
import { useNow } from '../net/useRoom.ts';
import { Chat } from '../ui/Chat.tsx';
import { Icon, UI_ICONS } from '../ui/icons.tsx';
import { Button, Confirm, CopyLink, Modal, Panel, Token } from '../ui/kit.tsx';
import { Board } from './Board.tsx';
import { AuctionPanel, DebtPanel, GameOver, LogPanel, TradesPanel } from './Panels.tsx';
import { PlayersPanel } from './PlayersPanel.tsx';
import { PropertyCard } from './PropertyCard.tsx';
import { TradeComposer, type TradeDraft } from './TradeComposer.tsx';
import { Dice, TurnControls, useTurnPrompt } from './TurnControls.tsx';
import { useGame } from './useGame.ts';

function useWide(): boolean {
  const query = '(min-width: 1100px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setWide(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);

  return wide;
}

type Tab = 'players' | 'card' | 'trades' | 'log' | 'chat';

export function GameScreen() {
  const { game, room, me } = useGame();
  const wide = useWide();
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<TradeDraft | null | false>(false);
  const [tab, setTab] = useState<Tab>('players');
  const [menu, setMenu] = useState(false);

  const openTrade = (draft: TradeDraft | null) => setDraft(draft);
  const askFor = (index: number) => {
    const owner = game.props[index]?.owner;
    if (owner) openTrade({ to: owner, give: { properties: [], cash: 0, jailCards: 0 }, get: { properties: [index], cash: 0, jailCards: 0 } });
  };
  const counter = (offer: TradeOffer) => openTrade({ to: offer.from, give: offer.get, get: offer.give, counterOf: offer.id });

  const select = (index: number) => {
    setSelected(index);
    if (!wide) setTab('card');
  };

  const card = selected !== null ? <PropertyCard index={selected} onTrade={askFor} /> : <p className="text-sm text-muted">Tap a space on the board to see its card.</p>;
  const pendingIncoming = me ? game.trades.filter((t) => t.to === me.id).length : 0;

  const modals = (
    <>
      {draft !== false && <TradeComposer draft={draft} onClose={() => setDraft(false)} />}
      {menu && <GameMenu onClose={() => setMenu(false)} />}
      {game.status === 'finished' && <GameOver />}
    </>
  );

  if (wide) {
    return (
      <div className="flex h-full gap-4 p-4">
        <aside className="flex w-[290px] shrink-0 flex-col gap-4">
          <Panel>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-[22px] font-semibold">{room.mapId === 'harborview' ? 'Harborview' : room.mapId}</span>
              <Button size="sm" tone="ghost" onClick={() => setMenu(true)} label="Game menu">
                <Icon path={UI_ICONS.menu} size={16} /> Menu
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted">Room {room.code}</p>
          </Panel>
          <Panel title="Game log" className="flex min-h-0 flex-1 flex-col">
            <LogPanel className="flex-1" />
          </Panel>
          <Panel title="Chat" className="flex h-[260px] shrink-0 flex-col">
            <Chat className="flex-1" />
          </Panel>
        </aside>

        <main className="flex min-w-0 flex-1 items-center justify-center">
          <div style={{ width: 'min(100%, calc(100vh - 32px))' }}>
            <Board game={game} members={room.members} selected={selected} onSelect={select} center={<BoardCenter />} />
          </div>
        </main>

        <aside className="flex w-[330px] shrink-0 flex-col gap-4 overflow-y-auto pb-2">
          <Panel title="Players">
            <PlayersPanel />
          </Panel>
          <AuctionPanel />
          <DebtPanel />
          {card}
          <TradesPanel onCompose={() => openTrade(null)} onCounter={counter} />
        </aside>
        {modals}
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'players', label: 'Players' },
    { id: 'card', label: 'Card' },
    { id: 'trades', label: pendingIncoming ? `Trades (${pendingIncoming})` : 'Trades' },
    { id: 'log', label: 'Log' },
    { id: 'chat', label: 'Chat' }
  ];

  return (
    <div className="mx-auto flex min-h-full max-w-[640px] flex-col">
      <header className="flex h-14 items-center gap-3 px-4">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="font-display text-lg font-semibold">Harborview</span>
          <span className="text-xs text-muted">Room {room.code}</span>
        </div>
        {me && (
          <span className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5">
            <Token {...memberLook(room.members, me.id)} size={16} />
            <span className="money font-semibold text-gold">{money(me.cash)}</span>
          </span>
        )}
        <button type="button" onClick={() => setMenu(true)} aria-label="Game menu" className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-panel">
          <Icon path={UI_ICONS.menu} size={22} />
        </button>
      </header>

      <div className="px-2">
        <Board game={game} members={room.members} selected={selected} onSelect={select} center={<BoardCenter small />} />
      </div>

      <div className="px-4 py-3">
        <TurnControls compact />
      </div>

      <div className="flex flex-col gap-3 px-4">
        <AuctionPanel />
        <DebtPanel />
      </div>

      <nav className="mt-2 grid grid-cols-5 border-b border-line px-2">
        {tabs.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={`h-11 border-b-[3px] text-[13px] font-semibold ${tab === t.id ? 'border-mint text-text' : 'border-transparent text-muted'}`}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 px-4 py-3 pb-8">
        {tab === 'players' && <PlayersPanel />}
        {tab === 'card' && card}
        {tab === 'trades' && <TradesPanel onCompose={() => openTrade(null)} onCounter={counter} />}
        {tab === 'log' && <LogPanel className="max-h-[50vh]" />}
        {tab === 'chat' && <Chat className="h-[50vh]" />}
      </div>
      {modals}
    </div>
  );
}

function BoardCenter({ small = false }: { small?: boolean }) {
  const prompt = useTurnPrompt();
  const { game } = useGame();
  const now = useNow(1000);

  if (small) {
    return (
      <div className="flex flex-col items-center gap-2">
        {prompt.timer && <span className="rounded-full bg-[#e2d8c2] px-2.5 py-0.5 text-[11px] font-semibold text-board-text">{prompt.timer}</span>}
        <Dice size={36} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 px-[8%] text-board-text">
      <span className="font-display text-[clamp(20px,3.2cqi,34px)] font-semibold tracking-wide">Harborview</span>
      {prompt.timer && <span className="rounded-full bg-[#e2d8c2] px-3 py-1 text-xs font-semibold">{prompt.timer} left</span>}
      {game.settings.jackpot.enabled && <span className="text-xs font-semibold text-board-sub">Jackpot {money(game.jackpot)}</span>}
      {game.timers.pausedAt !== null && <span className="text-xs font-semibold text-board-sub">Paused for {clock(now - game.timers.pausedAt)}</span>}
      <Dice size={60} />
      <TurnControls />
    </div>
  );
}

function GameMenu({ onClose }: { onClose: () => void }) {
  const { game, room, isHost, active, connection } = useGame();
  const [confirm, setConfirm] = useState<'leave' | 'end' | null>(null);
  const paused = game.timers.pausedAt !== null;

  return (
    <Modal title="Game menu" onClose={onClose}>
      <p className="mb-2 text-[13px] text-muted">Invite people to watch with the room link</p>
      <CopyLink url={`${location.origin}/r/${room.code}`} />

      {isHost && game.status === 'playing' && (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-muted">Host</p>
          <Button onClick={() => connection.lobby({ op: paused ? 'resume' : 'pause' })}>{paused ? 'Resume the game' : 'Pause the game'}</Button>
          <Button tone="danger" onClick={() => setConfirm('end')}>
            End the game now
          </Button>
        </div>
      )}

      {active && game.status === 'playing' && (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-muted">You</p>
          <Button tone="danger" onClick={() => setConfirm('leave')}>
            Leave the game
          </Button>
        </div>
      )}

      {confirm === 'end' && (
        <Confirm
          title="End the game now?"
          body="The richest player by net worth wins."
          action="End the game"
          onConfirm={() => {
            connection.lobby({ op: 'endGame' });
            onClose();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'leave' && (
        <Confirm
          title="Leave the game?"
          body="You’re out for good. Your properties go back to the bank."
          action="Leave"
          onConfirm={() => {
            connection.act({ type: 'leave' });
            onClose();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </Modal>
  );
}
