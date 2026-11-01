import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useConnection, useRoom } from '../net/useRoom.ts';
import { Icon, UI_ICONS } from './icons.tsx';

export function Chat({ className = '' }: { className?: string }) {
  const connection = useConnection();
  const { chat, room, you } = useRoom();
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat.length]);

  const colors = new Map(room?.members.map((m) => [m.id, m.color]));
  const me = room?.members.find((m) => m.id === you?.id);
  const canChat = me?.role === 'player' || (room?.settings.room.spectatorChat && !me?.muted);

  function send(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    connection.say(clean);
    setText('');
  }

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div ref={list} className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-[13px]">
        {chat.length === 0 && <p className="text-muted">No messages yet. Say hi.</p>}
        {chat.map((m) => (
          <p key={m.id} className="break-words">
            <span className="font-semibold" style={{ color: colors.get(m.from) ?? '#9AA0C8' }}>
              {m.name}
            </span>
            {m.role === 'spectator' && <span className="ml-1 text-[11px] text-muted">(watching)</span>} <span className="text-soft">{m.text}</span>
          </p>
        ))}
      </div>
      {canChat ? (
        <form onSubmit={send} className="flex gap-2">
          <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} aria-label="Message" placeholder="Say something" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-sm" />
          <button type="submit" aria-label="Send message" className="flex h-11 w-11 items-center justify-center rounded-xl bg-raised text-text">
            <Icon path={UI_ICONS.send} />
          </button>
        </form>
      ) : (
        <p className="text-[12px] text-muted">Chat is off for spectators in this room.</p>
      )}
    </div>
  );
}
