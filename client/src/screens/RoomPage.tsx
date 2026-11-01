import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { navigate } from '../App.tsx';
import { readStored, removeStored, writeStored } from '../lib/storage.ts';
import { GameScreen } from '../game/GameScreen.tsx';
import { Lobby } from '../lobby/Lobby.tsx';
import { RoomContext, useConnection, useRoom, useRoomConnection } from '../net/useRoom.ts';
import { Button, Panel } from '../ui/kit.tsx';
import { Toasts } from '../ui/Toasts.tsx';

interface RoomInfo {
  exists: boolean;
  phase?: string;
  players?: number;
  seats?: number;
  spectators?: boolean;
}

export function RoomPage({ code }: { code: string }) {
  const connection = useRoomConnection(code);

  return (
    <RoomContext.Provider value={connection}>
      <RoomRouter code={code} />
      <Toasts />
    </RoomContext.Provider>
  );
}

function RoomRouter({ code }: { code: string }) {
  const state = useRoom();

  if (state.fatal) {
    return (
      <Centered>
        <Panel>
          <h1 className="font-display text-2xl font-semibold">{state.fatal.code === 'kicked' ? 'You were removed' : state.fatal.code === 'noRoom' ? `Room ${code} has closed` : 'You can’t join this room'}</h1>
          <p className="mt-2 text-soft">{state.fatal.message}</p>
          <Button tone="primary" className="mt-4" onClick={() => navigate('/')}>
            Back to the start
          </Button>
        </Panel>
      </Centered>
    );
  }

  if (state.needsName) return <JoinPrompt code={code} />;

  if (!state.room || !state.you) {
    return (
      <Centered>
        <p className="text-center text-muted">{state.status === 'reconnecting' ? 'Reconnecting…' : 'Joining the room…'}</p>
      </Centered>
    );
  }

  return (
    <>
      {state.status !== 'open' && (
        <div role="status" className="fixed inset-x-0 top-0 z-40 bg-amber py-2 text-center text-sm font-semibold text-ink">
          Reconnecting… your seat is safe.
        </div>
      )}
      {state.room.phase === 'lobby' || !state.game ? <Lobby /> : <GameScreen />}
    </>
  );
}

function JoinPrompt({ code }: { code: string }) {
  const connection = useConnection();
  const queued = useRef(readStored('session', `rent-is-due:join:${code}`));
  const [name, setName] = useState(() => queued.current ?? readStored('local', 'rent-is-due:name') ?? '');
  const [info, setInfo] = useState<RoomInfo | null>(null);

  useEffect(() => {
    const auto = queued.current;
    if (!auto) return;
    queued.current = null;
    removeStored('session', `rent-is-due:join:${code}`);
    connection.join(auto, false);
  }, [code, connection]);

  useEffect(() => {
    fetch(`/api/rooms/${code}`)
      .then((r) => r.json() as Promise<RoomInfo>)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [code]);

  if (info && !info.exists) {
    return (
      <Centered>
        <Panel>
          <h1 className="font-display text-2xl font-semibold">There’s no room called {code}</h1>
          <p className="mt-2 text-soft">Check the code with whoever sent it. Rooms close after a day with nobody in them.</p>
          <Button tone="primary" className="mt-4" onClick={() => navigate('/')}>
            Back to the start
          </Button>
        </Panel>
      </Centered>
    );
  }

  const full = info?.phase === 'lobby' && (info.players ?? 0) >= (info.seats ?? 6);
  const started = !!info?.phase && info.phase !== 'lobby';
  const watchOnly = full || started;

  function submit(e: FormEvent, spectate: boolean) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    writeStored('local', 'rent-is-due:name', clean);
    connection.join(clean, spectate);
  }

  return (
    <Centered>
      <Panel>
        <form onSubmit={(e) => submit(e, watchOnly)} className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-semibold">Join room {code}</h1>
          {info?.exists && (
            <p className="text-sm text-muted">
              {started ? 'This game has already started, so you can watch.' : full ? 'All seats are taken, so you can watch.' : `${info.players} of ${info.seats} seats taken.`}
            </p>
          )}
          <label htmlFor="join-name" className="text-[13px] font-semibold text-muted">
            Your name
          </label>
          <input id="join-name" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl border border-line bg-ink px-4 text-lg" />
          <Button tone="primary" size="lg" type="submit" disabled={!name.trim()}>
            {watchOnly ? 'Watch the game' : 'Take a seat'}
          </Button>
          {!watchOnly && info?.spectators && (
            <Button tone="ghost" onClick={() => name.trim() && connection.join(name.trim(), true)}>
              Just watch
            </Button>
          )}
        </form>
      </Panel>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-10">{children}</main>;
}
