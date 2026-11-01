import { useState, type FormEvent } from 'react';
import { navigate } from '../App.tsx';
import { Button, Panel } from '../ui/kit.tsx';

export function Home() {
  const [name, setName] = useState(() => localStorage.getItem('rent-is-due:name') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('Pick a name first.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error();
      const { code: newCode } = (await res.json()) as { code: string };
      localStorage.setItem('rent-is-due:name', clean);
      sessionStorage.setItem(`rent-is-due:join:${newCode}`, clean);
      navigate(`/r/${newCode}`);
    } catch {
      setError('Could not create a room. Check your connection and try again.');
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(clean)) {
      setError('Room codes are 6 letters and numbers.');
      return;
    }
    if (name.trim()) {
      localStorage.setItem('rent-is-due:name', name.trim());
      sessionStorage.setItem(`rent-is-due:join:${clean}`, name.trim());
    }
    navigate(`/r/${clean}`);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="font-display text-5xl font-semibold tracking-wide">Rent Is Due</h1>
        <p className="mt-2 text-muted">Buy streets, charge rent and bankrupt your friends.</p>
      </div>

      <Panel>
        <form onSubmit={create} className="flex flex-col gap-3">
          <label htmlFor="name" className="text-[13px] font-semibold text-muted">
            Your name
          </label>
          <input
            id="name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sam"
            className="h-12 rounded-xl border border-line bg-ink px-4 text-lg"
          />
          <Button tone="primary" size="lg" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create a room'}
          </Button>
        </form>
      </Panel>

      <Panel>
        <form onSubmit={join} className="flex flex-col gap-3">
          <label htmlFor="code" className="text-[13px] font-semibold text-muted">
            Got a code from a friend?
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="KQZP2M"
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-ink px-4 text-lg uppercase tracking-widest"
            />
            <Button size="lg" type="submit">
              Join
            </Button>
          </div>
        </form>
      </Panel>

      {error && (
        <p role="alert" className="text-center text-danger">
          {error}
        </p>
      )}
    </main>
  );
}
