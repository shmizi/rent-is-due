import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { inkFor } from '../lib/game.ts';
import { Icon, TOKEN_PATHS, UI_ICONS } from './icons.tsx';

type Tone = 'primary' | 'secondary' | 'ghost' | 'danger';

const TONES: Record<Tone, string> = {
  primary: 'bg-mint text-ink font-bold hover:brightness-105',
  secondary: 'bg-raised text-text border border-line hover:border-muted',
  ghost: 'bg-transparent text-text border border-line hover:bg-raised',
  danger: 'bg-transparent text-danger border border-danger/50 hover:bg-danger/10'
};

export function Button({
  children,
  onClick,
  tone = 'secondary',
  size = 'md',
  className = '',
  disabled,
  type = 'button',
  label
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
  label?: string;
}) {
  const sizes = { sm: 'h-9 px-3 text-sm rounded-lg', md: 'h-11 px-4 rounded-xl', lg: 'h-12 px-6 text-base rounded-full' };
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={label} className={`inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-50 ${TONES[tone]} ${sizes[size]} ${className}`}>
      {children}
    </button>
  );
}

export function Panel({ title, children, className = '', right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-panel p-4 ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-muted">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      className={`flex h-11 w-14 shrink-0 items-center justify-center bg-transparent ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      <span className={`relative block h-[26px] w-[46px] rounded-full transition ${disabled ? 'bg-[#2a2f55]' : checked ? 'bg-mint' : 'bg-[#3a4170]'}`}>
        <span className={`absolute top-[3px] h-5 w-5 rounded-full transition-all ${disabled ? 'bg-[#5b6190]' : 'bg-white'} ${checked ? 'left-[23px]' : 'left-[3px]'}`} />
      </span>
    </button>
  );
}

export function Token({ color, shape, label, size = 28 }: { color: string; shape: string; label?: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="absolute inset-0">
        <path d={TOKEN_PATHS[shape] ?? TOKEN_PATHS.circle} fill={color} stroke="#fff" strokeWidth="2" />
      </svg>
      {label && (
        <span className="relative text-[11px] font-bold" style={{ color: inkFor(color) }}>
          {label}
        </span>
      )}
    </span>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(onClose?: () => void) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => opener?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    e.stopPropagation();

    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.closest('[role="dialog"]') === dialog.current);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return { ref: dialog, tabIndex: -1, onKeyDown, role: 'dialog', 'aria-modal': true } as const;
}

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const dialog = useDialog(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#060814]/70 sm:items-center" onClick={onClose}>
      <div
        {...dialog}
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl outline-none border border-line bg-panel p-5 sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-raised">
            <Icon path={UI_ICONS.close} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ title, body, action, tone = 'danger', onConfirm, onClose }: { title: string; body: string; action: string; tone?: Tone; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-5 text-soft">{body}</p>
      <div className="flex justify-end gap-2">
        <Button tone="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          tone={tone}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {action}
        </Button>
      </div>
    </Modal>
  );
}

export function CopyLink({ url }: { url: string }) {
  return (
    <div className="flex gap-2">
      <input readOnly value={url} aria-label="Room link" onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-ink px-3 text-[13px] text-text" />
      <CopyButton text={url} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}
