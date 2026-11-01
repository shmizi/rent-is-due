import { useEffect, useState } from 'react';
import { MAPS } from '../../../shared/src/maps/index.ts';
import { PLAYER_COLORS, TOKEN_SHAPES, type MemberView } from '../../../shared/src/protocol.ts';
import type { Settings } from '../../../shared/src/types.ts';
import { useConnection, useRoom } from '../net/useRoom.ts';
import { Chat } from '../ui/Chat.tsx';
import { Icon, TOKEN_PATHS, UI_ICONS } from '../ui/icons.tsx';
import { Button, CopyLink, Panel, Toggle, Token } from '../ui/kit.tsx';
import { houseRulesOn, isHouseRule, SECTIONS, type RuleRow } from './rules.ts';

const UPCOMING = [
  { name: 'Pocket Town', meta: '32 spaces, coming later' },
  { name: 'Metro Sprawl', meta: '48 spaces, coming later' },
  { name: 'World', meta: 'Real countries and cities, coming later' }
];

export function Lobby() {
  const connection = useConnection();
  const { room, you } = useRoom();
  if (!room || !you) return null;

  const isHost = room.members.some((m) => m.id === you.id && m.host);
  const players = room.members.filter((m) => m.role === 'player');
  const watchers = room.members.filter((m) => m.role === 'spectator');
  const url = `${location.origin}/r/${room.code}`;
  const map = MAPS[room.mapId];

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 p-4 lg:h-full lg:flex-row lg:p-5">
      <aside className="flex flex-col gap-4 lg:w-[340px] lg:shrink-0">
        <Panel>
          <div className="mb-2 flex items-baseline justify-between">
            <h1 className="font-display text-2xl font-semibold">Room {room.code}</h1>
            <span className="text-xs text-muted">Lobby</span>
          </div>
          <p className="mb-2 text-[13px] text-muted">Send this link to your friends</p>
          <CopyLink url={url} />
        </Panel>

        <Panel title="Players" right={<span className="text-xs text-muted">{players.length} of {room.settings.room.maxPlayers} seats</span>}>
          <ul className="flex flex-col gap-1">
            {players.map((m) => (
              <MemberRow key={m.id} member={m} me={m.id === you.id} isHost={isHost} />
            ))}
          </ul>
          {watchers.length > 0 && <p className="mt-2 text-xs text-muted">Watching: {watchers.map((w) => w.name).join(', ')}</p>}
        </Panel>

        {you.role === 'player' && <YourLook members={room.members} meId={you.id} />}

        <Panel title="Chat" className="flex min-h-[220px] flex-col lg:min-h-0 lg:flex-1">
          <Chat className="flex-1" />
        </Panel>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-3xl font-semibold">Game setup</h2>
            <p className="text-[13px] text-muted">{isHost ? 'You’re the host, so you can change these. Everyone else sees them read-only.' : 'The host is setting up the game. You can see the rules here.'}</p>
          </div>
          {isHost ? (
            <Button tone="primary" size="lg" onClick={() => connection.lobby({ op: 'start' })} disabled={players.length < 2}>
              {players.length < 2 ? 'Waiting for players' : 'Start game'}
            </Button>
          ) : (
            <span className="rounded-full bg-raised px-4 py-2 text-sm text-muted">Waiting for the host to start</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-2 rounded-2xl border-2 border-mint bg-panel px-4 py-3">
            <Swatches colors={Object.values(map.groups).map((g) => g.color)} />
            <span className="font-display text-lg font-semibold">{map.name}</span>
            <span className="text-xs text-muted">{map.spaces.length} spaces, {Object.keys(map.groups).length} colour sets</span>
          </div>
          {UPCOMING.map((m) => (
            <div key={m.name} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel px-4 py-3 text-[#7d83ad]">
              <Swatches colors={Array(8).fill('#4a4f78')} />
              <span className="font-display text-lg font-semibold">{m.name}</span>
              <span className="text-xs">{m.meta}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold text-muted">Preset</span>
          <div className="flex gap-1 rounded-xl border border-line bg-panel p-1">
            {(['classic', 'quick'] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={!isHost}
                aria-pressed={room.preset === p}
                onClick={() => connection.lobby({ op: 'preset', preset: p })}
                className={`h-10 rounded-lg px-4 font-semibold capitalize ${room.preset === p ? 'bg-mint text-ink' : 'text-text'} disabled:cursor-default`}
              >
                {p}
              </button>
            ))}
          </div>
          <span className={`text-[13px] ${room.preset === 'custom' ? 'text-amber' : 'text-muted'}`}>
            {room.preset === 'classic' ? 'Every Core rule on, no house rules' : room.preset === 'quick' ? '2 properties each, richest after 20 rounds wins' : 'Custom: a setting was changed'}
          </span>
        </div>

        {room.notes.length > 0 && (
          <ul className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] text-amber">
            {room.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        <Rules settings={room.settings} editable={isHost} onChange={(s) => connection.lobby({ op: 'settings', settings: s })} />
      </main>
    </div>
  );
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <span className="flex gap-[3px]">
      {colors.map((c, i) => (
        <span key={i} className="h-2 w-4 rounded-sm" style={{ background: c }} />
      ))}
    </span>
  );
}

function MemberRow({ member, me, isHost }: { member: MemberView; me: boolean; isHost: boolean }) {
  const connection = useConnection();

  return (
    <li className={`flex items-center gap-3 rounded-xl px-2 py-2 ${me ? 'bg-raised' : ''}`}>
      <Token color={member.color} shape={member.shape} label={member.name.charAt(0).toUpperCase()} size={32} />
      <span className="min-w-0 flex-1 truncate font-semibold">
        {member.name}
        {me && <span className="font-normal text-muted"> (you)</span>}
      </span>
      {member.host && <span className="rounded-full bg-[#3a3215] px-2 py-0.5 text-[11px] font-bold text-gold">Host</span>}
      <span className={`text-xs ${member.connected ? 'text-mint' : 'text-muted'}`}>{member.connected ? 'Here' : 'Away'}</span>
      {isHost && !me && (
        <Button size="sm" tone="ghost" onClick={() => connection.lobby({ op: 'kick', player: member.id })} label={`Remove ${member.name}`}>
          <Icon path={UI_ICONS.close} size={14} />
        </Button>
      )}
    </li>
  );
}

function YourLook({ members, meId }: { members: MemberView[]; meId: string }) {
  const connection = useConnection();
  const me = members.find((m) => m.id === meId)!;
  const [name, setName] = useState(me.name);
  useEffect(() => setName(me.name), [me.name]);

  const takenBy = new Map(members.filter((m) => m.role === 'player' && m.id !== meId).map((m) => [m.color, m.name]));

  return (
    <Panel title="Your look">
      <div className="flex flex-wrap gap-1.5">
        {PLAYER_COLORS.map((color) => {
          const taken = takenBy.get(color);
          return (
            <button
              key={color}
              type="button"
              aria-label={taken ? `${color}, taken by ${taken}` : color}
              aria-pressed={me.color === color}
              disabled={!!taken}
              onClick={() => connection.lobby({ op: 'appearance', color })}
              className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] ${me.color === color ? 'border-mint' : 'border-transparent'}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-ink" style={{ background: color, opacity: taken ? 0.35 : 1 }}>
                {taken?.charAt(0)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        {TOKEN_SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            aria-label={`${shape} token`}
            aria-pressed={me.shape === shape}
            onClick={() => connection.lobby({ op: 'appearance', shape })}
            className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 bg-ink ${me.shape === shape ? 'border-mint' : 'border-line'}`}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
              <path d={TOKEN_PATHS[shape]} fill={me.color} stroke="#fff" strokeWidth="1.5" />
            </svg>
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== me.name) connection.lobby({ op: 'appearance', name: name.trim() });
        }}
      >
        <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label="Your name" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-sm" />
        <Button type="submit" disabled={!name.trim() || name.trim() === me.name}>
          Rename
        </Button>
      </form>
    </Panel>
  );
}

function Rules({ settings, editable, onChange }: { settings: Settings; editable: boolean; onChange: (s: Settings) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ money: true, dice: true });

  function update(row: RuleRow, value: boolean | string | number) {
    const next = structuredClone(settings);
    (row.set as (s: Settings, v: typeof value) => void)(next, value);
    onChange(next);
  }

  return (
    <div className="columns-1 gap-4 xl:columns-2">
      {SECTIONS.map((section) => {
        const rows = section.rows.filter((r) => !r.hidden?.(settings));
        const blocked = rows.filter((r) => r.blocked?.(settings)).length;
        const house = houseRulesOn(section, settings);
        const summary = blocked > 0 ? `${blocked} greyed out` : house > 0 ? `${house} house rule${house > 1 ? 's' : ''} on` : 'Core defaults';
        const isOpen = !!open[section.id];

        return (
          <section key={section.id} className="mb-4 break-inside-avoid rounded-2xl border border-line bg-panel">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen({ ...open, [section.id]: !isOpen })}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="flex-1 font-semibold">{section.title}</span>
              <span className={`text-xs ${blocked ? 'text-amber' : house ? 'text-lilac' : 'text-muted'}`}>{summary}</span>
              <Icon path={UI_ICONS.chevron} size={16} className={`text-muted transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-4 pb-1">
                {rows.map((row) => (
                  <RuleLine key={row.id} row={row} settings={settings} editable={editable} onChange={(v) => update(row, v)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RuleLine({ row, settings, editable, onChange }: { row: RuleRow; settings: Settings; editable: boolean; onChange: (v: boolean | string | number) => void }) {
  const reason = row.blocked?.(settings) ?? null;
  const house = isHouseRule(row, settings);

  return (
    <div className="flex items-center gap-3 border-t border-[#262c55] py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`font-semibold ${reason ? 'text-[#7d83ad]' : ''}`}>{row.label}</span>
          {house && <span className="rounded-full bg-[#33264a] px-2 py-px text-[11px] font-bold text-lilac">House rule</span>}
        </span>
        <span className={`text-xs ${reason ? 'text-amber' : 'text-muted'}`}>{reason ?? row.desc}</span>
      </div>
      <RuleControl row={row} settings={settings} editable={editable && !reason} onChange={onChange} />
    </div>
  );
}

function RuleControl({ row, settings, editable, onChange }: { row: RuleRow; settings: Settings; editable: boolean; onChange: (v: boolean | string | number) => void }) {
  const [draft, setDraft] = useState('');
  const value = row.get(settings);
  useEffect(() => setDraft(String(value)), [value]);

  if (row.kind === 'toggle') {
    return <Toggle checked={row.get(settings) && !row.blocked?.(settings)} label={row.label} disabled={!editable} onChange={(v) => onChange(v)} />;
  }

  if (!editable) {
    const text = row.kind === 'select' ? row.options.find((o) => o.value === row.get(settings))?.label : `${row.prefix ?? ''}${row.get(settings).toLocaleString('en-US')}${row.suffix ?? ''}`;
    return <span className="shrink-0 whitespace-nowrap rounded-lg border border-line bg-raised px-3 py-1.5 text-[13px] font-semibold">{text}</span>;
  }

  if (row.kind === 'select') {
    return (
      <select value={row.get(settings)} onChange={(e) => onChange(e.target.value)} aria-label={row.label} className="h-10 shrink-0 rounded-lg border border-line bg-raised px-2 text-[13px] font-semibold">
        {row.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n !== row.get(settings)) onChange(Math.min(row.max, Math.max(row.min, Math.round(n / row.step) * row.step)));
    else setDraft(String(row.get(settings)));
  };

  return (
    <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold">
      {row.prefix}
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        min={row.min}
        max={row.max}
        step={row.step}
        aria-label={row.label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="h-10 w-20 rounded-lg border border-line bg-raised px-2 text-right"
      />
      {row.suffix}
    </span>
  );
}
