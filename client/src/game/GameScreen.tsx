import { useEffect, useRef, useState } from 'react';
import type { TradeOffer } from '../../../shared/src/types.ts';
import { clock, describe, money, spaceName } from '../lib/format.ts';
import { mapFor, memberLook, playerById } from '../lib/game.ts';
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

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

type Tab = 'players' | 'card' | 'trades' | 'log' | 'chat';

export function GameScreen() {
  const { game, room, me, you } = useGame();
  const wide = useMedia('(min-width: 1024px)');
  const roomy = useMedia('(min-width: 1280px)');
  const [selected, setSelected] = useState<number | null>(null);
  const [focusedPlayer, setFocusedPlayer] = useState<string | null>(null);
  const [locateCount, setLocateCount] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<TradeDraft | null | false>(false);
  const [tab, setTab] = useState<Tab>('players');
  const [menu, setMenu] = useState(false);
  const current = playerById(game, game.turn.player)!;
  const located = playerById(game, focusedPlayer) ?? current;
  const inspected = focusedPlayer ? located.position : selected ?? game.turn.pendingBuy ?? current.position;
  const map = mapFor(game);
  const occupants = game.players.filter((p) => p.status === 'active' && p.position === inspected);
  const owesMoney = game.debts.some((debt) => debt.debtor === me?.id);

  useEffect(() => {
    if (!zoomed || !stage.current) return;
    const tile = stage.current.querySelector<HTMLElement>(`[data-space="${located.position}"]`);
    if (!tile) return;
    const tileRect = tile.getBoundingClientRect();
    const frame = stage.current.getBoundingClientRect();
    stage.current.scrollTo({
      left: stage.current.scrollLeft + tileRect.left - frame.left - frame.width / 2 + tileRect.width / 2,
      top: stage.current.scrollTop + tileRect.top - frame.top - frame.height / 2 + tileRect.height / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  }, [zoomed, focusedPlayer, locateCount, located.position]);

  const locate = (id: string) => {
    const player = playerById(game, id);
    if (!player) return;
    setFocusedPlayer(id);
    setSelected(player.position);
    setLocateCount((count) => count + 1);
    const frame = stage.current?.getBoundingClientRect();
    if (frame && (frame.top < 0 || frame.bottom > window.innerHeight - (wide ? 16 : 150))) {
      stage.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    }
  };
  const select = (index: number) => {
    setSelected(index);
    setFocusedPlayer(null);
    if (!wide) {
      setTab('card');
      setSpaceOpen(true);
    }
  };
  const askFor = (index: number) => {
    const owner = game.props[index]?.owner;
    if (owner) setDraft({ to: owner, give: { properties: [], cash: 0, jailCards: 0 }, get: { properties: [index], cash: 0, jailCards: 0 } });
  };
  const counter = (offer: TradeOffer) => setDraft({ to: offer.from, give: offer.get, get: offer.give, counterOf: offer.id });
  const card = <PropertyCard index={inspected} onTrade={askFor} />;
  const pendingIncoming = me ? game.trades.filter((t) => t.to === me.id).length : 0;
  const locator = (
    <div className="player-locator" aria-label="Find players on the board">
      {game.players.filter((p) => p.status === 'active').map((p) => <button type="button" key={p.id} onClick={() => locate(p.id)} aria-label={`Find ${p.name} on the board`} aria-pressed={focusedPlayer === p.id} className="locator-chip"><Token {...memberLook(room.members, p.id)} label={p.name.charAt(0).toUpperCase()} size={26} /><span>{p.id === you.id ? 'You' : p.name}</span>{p.id === game.turn.player && <span className="locator-turn">TURN</span>}</button>)}
    </div>
  );
  const tabs: { id: Tab; label: string }[] = [
    { id: 'players', label: 'Players' }, { id: 'card', label: 'Space' },
    { id: 'trades', label: pendingIncoming ? `Trades (${pendingIncoming})` : 'Trades' },
    { id: 'log', label: 'Log' }, { id: 'chat', label: 'Chat' }
  ];

  return (
    <div className={`play-page ${game.auction ? 'has-auction' : ''} ${roomy ? 'is-roomy' : ''}`}>
      {!roomy && <header className="play-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="brand-mark" aria-hidden="true">R<span>→</span></span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold leading-tight">Rent Is Due<span className="hidden text-muted sm:inline"> / {map.name}</span></h1>
            <p className="mt-1 whitespace-nowrap text-xs text-muted">Room {room.code}<span className="hidden min-[380px]:inline"><span className="mx-2 text-line">•</span>Round {game.round}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {me && <div className="balance-chip"><Token {...memberLook(room.members, me.id)} size={28} /><div><span className="hidden text-[10px] font-semibold uppercase tracking-wider text-muted sm:block">Your cash</span><span className="money text-lg font-semibold text-gold">{money(me.cash)}</span></div></div>}
          <Button tone="ghost" size="sm" onClick={() => setMenu(true)} label="Game menu"><Icon path={UI_ICONS.menu} size={18} /><span className="hidden sm:inline">Menu</span></Button>
        </div>
      </header>}

      <div className="play-layout">
        {roomy && (
          <aside className="game-left">
            <Panel>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="font-display text-2xl font-semibold leading-tight">Rent Is Due</h1>
                  <p className="mt-1 text-xs text-muted">{map.name} · Room {room.code} · Round {game.round}</p>
                </div>
                <Button tone="ghost" size="sm" onClick={() => setMenu(true)} label="Game menu"><Icon path={UI_ICONS.menu} size={18} /> Menu</Button>
              </div>
              {me && <div className="balance-chip mt-3"><Token {...memberLook(room.members, me.id)} size={28} /><div><span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">Your cash</span><span className="money text-lg font-semibold text-gold">{money(me.cash)}</span></div></div>}
            </Panel>
            <Panel title="Invite friends">
              <CopyLink url={`${location.origin}/r/${room.code}`} />
            </Panel>
            <Panel title="Chat" className="flex min-h-0 flex-1 flex-col">
              <Chat className="min-h-0 flex-1" />
            </Panel>
          </aside>
        )}
        <main className="play-main">
          <div className="board-toolbar">
            {roomy ? locator : <div className="min-w-0"><p className="eyebrow">THE MAP</p><p className="font-display text-lg font-semibold">{map.name}</p></div>}
            <div className="flex items-center gap-2">
              {me?.status === 'active' && <button type="button" className="board-tool find-piece" onClick={() => locate(me.id)}><span aria-hidden="true">◎</span> Find my piece</button>}
              <button type="button" className="board-tool" aria-pressed={zoomed} onClick={() => setZoomed((value) => !value)} aria-label={zoomed ? 'Fit board to screen' : 'Zoom board'}><span aria-hidden="true">{zoomed ? '−' : '+'}</span><span className="hidden sm:inline">{zoomed ? 'Fit' : 'Zoom'}</span></button>
            </div>
          </div>
          <div className={`board-shell ${zoomed ? 'is-zoomed' : ''}`} ref={stage}>
            <Board game={game} members={room.members} selected={inspected} onSelect={select} focusedPlayer={focusedPlayer} you={you.id} center={<BoardCenter small={!wide} />} />
          </div>
          {zoomed && <p className="mt-2 text-center text-xs text-muted">Scroll or swipe to explore. Find my piece brings you back.</p>}
          {!roomy && locator}
          {!wide && (
            <>
              <div className="space-summary" aria-live="polite">
                <div className="min-w-0"><span className="eyebrow">{focusedPlayer ? 'PLAYER LOCATION' : selected === null ? 'CURRENT SPACE' : 'SELECTED SPACE'}</span><p className="truncate font-semibold">{spaceName(game, inspected)}</p><p className="mt-1 text-xs text-muted">{occupants.length ? occupants.map((p) => p.id === you.id ? `${p.name} (you)` : p.name).join(' · ') : 'No players here'}</p></div>
                <button type="button" className="board-tool" onClick={() => { setTab('card'); setSpaceOpen(true); }}>Details <span aria-hidden="true">↗</span></button>
              </div>
              <TurnStory />
            </>
          )}
        </main>

        <aside className="game-side" id="game-details">
          {wide && <AuctionPanel />}<DebtPanel />
          {!wide && <nav className="game-tabs" aria-label="Game panels">{tabs.map((item) => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>}
          {(wide || tab === 'players') && <Panel title="Around the board" right={<span className="text-xs text-muted">{game.players.filter((p) => p.status === 'active').length} playing</span>}><PlayersPanel onLocate={locate} /></Panel>}
          {(wide || tab === 'card') && card}
          {(wide || tab === 'trades') && <TradesPanel onCompose={() => setDraft(null)} onCounter={counter} />}
          {wide && !roomy && (
            <>
              <Panel title="Invite friends"><CopyLink url={`${location.origin}/r/${room.code}`} /></Panel>
              <Panel title="Chat" className="flex h-[300px] shrink-0 flex-col"><Chat className="min-h-0 flex-1" /></Panel>
            </>
          )}
          {!wide && tab === 'log' && <Panel title="Game log"><LogPanel className="max-h-[50vh]" /></Panel>}
          {!wide && tab === 'chat' && <Panel title="Chat"><Chat className="h-[40vh]" /></Panel>}
        </aside>
      </div>
      {!wide && <div className="mobile-turnbar">
        {game.auction ? <AuctionPanel /> : <>
          <TurnControls compact />
          {owesMoney && <Button className="mt-2 w-full" tone="primary" onClick={() => document.getElementById('game-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Manage debt</Button>}
        </>}
      </div>}
      {!wide && spaceOpen && <Modal title={spaceName(game, inspected)} onClose={() => setSpaceOpen(false)}>{card}</Modal>}
      {draft !== false && <TradeComposer draft={draft} onClose={() => setDraft(false)} />}
      {menu && <GameMenu onClose={() => setMenu(false)} />}
      {game.status === 'finished' && <GameOver />}
    </div>
  );
}

function CenterLog() {
  const { game, room, state } = useGame();
  const lines = state.log
    .map((event, i) => ({ event, i, text: describe(event, game) }))
    .filter((l) => l.text && l.event.type !== 'rolled')
    .reverse()
    .slice(0, 40);
  if (lines.length === 0) return null;

  return (
    <div className="center-log" aria-label="Game log">
      {lines.map(({ event, i, text }, n) => (
        <p key={i} style={{ opacity: Math.max(0.35, 1 - n * 0.12) }}>
          <span className="center-log-dot" style={{ background: event.player ? memberLook(room.members, event.player).color : '#8a806a' }} />
          {text}
        </p>
      ))}
    </div>
  );
}

function TurnStory() {
  const { game, state } = useGame();
  let start = -1;
  for (let index = state.log.length - 1; index >= 0; index--) {
    if (state.log[index].type === 'turnStarted') { start = index; break; }
  }
  const events = state.log.slice(start + 1);
  const event = [...events].reverse().find((event) => ['card', 'paid', 'bought', 'auctionWon', 'jailed', 'salary', 'jackpot'].includes(event.type));
  if (!event) return null;
  return <div className="turn-story" role="status"><span aria-hidden="true">↳</span><p>{describe(event, game)}</p></div>;
}

function BoardCenter({ small = false }: { small?: boolean }) {
  const prompt = useTurnPrompt();
  const { game, room, you } = useGame();
  const now = useNow(1000);
  const current = playerById(game, game.turn.player)!;
  return <div className={`board-center-content ${small ? 'is-small' : ''}`}>
    <div className="center-player"><Token {...memberLook(room.members, current.id)} label={current.name.charAt(0).toUpperCase()} size={small ? 30 : 34} /><span>{current.id === you.id ? 'Your turn' : current.name}</span>{prompt.timer && <span className="center-timer">{prompt.timer}</span>}</div>
    {!small && <span className="center-location">{current.inJail ? 'At the Visa Office' : `At ${spaceName(game, current.position)}`}</span>}
    <Dice size={small ? 36 : 'var(--die-size)'} />
    {game.settings.jackpot.enabled && <span className="center-location">Jackpot {money(game.jackpot)}</span>}
    {game.timers.pausedAt !== null && <span className="center-location">Paused for {clock(now - game.timers.pausedAt)}</span>}
    {!small && <TurnControls />}
    {!small && <CenterLog />}
  </div>;
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
