import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon.tsx';

/** Counts how often a value changed since mount; use as `key` to replay an animation on change. */
export function useChanges(value: string) {
  const previous = useRef(value);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setCount((c) => c + 1);
  }, [value]);
  return count;
}

export function LiveBadge({ small }: { small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-(--color-live) font-bold tracking-wide text-(--color-brand-ink) ${small ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}
    >
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" />
      LIVE
    </span>
  );
}

export function FormBadges({ form }: { form: ('W' | 'D' | 'L')[] }) {
  const style = { W: 'bg-(--color-win)', D: 'bg-(--color-draw)', L: 'bg-(--color-loss)' };
  const label = { W: 'S', D: 'U', L: 'N' };
  const title = { W: 'Sieg', D: 'Unentschieden', L: 'Niederlage' };
  return (
    <span className="inline-flex gap-0.5" aria-label={`Form: ${form.map((f) => title[f]).join(', ')}`}>
      {form.map((f, i) => (
        <span key={i} title={title[f]} className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-(--color-brand-ink) ${style[f]}`}>
          {label[f]}
        </span>
      ))}
    </span>
  );
}

export function FavoriteStar({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
      className={`flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-lg transition hover:bg-(--color-surface-2) ${on ? 'text-(--color-brand)' : 'text-(--color-ink-3)'}`}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>
    </button>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section-block">
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="scrollbar-none mb-4 flex gap-1 overflow-x-auto rounded-xl bg-(--color-surface-2) p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          tabIndex={value === t.id ? 0 : -1}
          onKeyDown={(event) => {
            const index = tabs.findIndex((tab) => tab.id === value);
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
            if (next < 0) return;
            event.preventDefault();
            onChange(tabs[next].id);
            (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
          }}
          className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${value === t.id ? 'bg-(--color-surface) text-(--color-ink) shadow-sm' : 'text-(--color-ink-2) hover:text-(--color-ink)'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`min-h-10 shrink-0 rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition ${value === o.id ? 'border-(--color-brand) bg-(--color-brand) text-(--color-brand-ink)' : 'border-(--color-line) bg-(--color-surface) text-(--color-ink-2) hover:text-(--color-ink)'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card px-3 py-3">
      <div className="text-xs text-(--color-ink-3)">{label}</div>
      <div className="tabular mt-0.5 text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString('de-DE') : value}</div>
      {hint && <div className="mt-0.5 text-xs text-(--color-ink-2)">{hint}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" role="status" aria-label="Daten werden geladen">
      <span className="sr-only">Daten werden geladen …</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-20 animate-pulse bg-(--color-surface-2)" />
      ))}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const client = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const message = error instanceof Error ? error.message : '';
  const missing = message.includes('Nicht gefunden') || message.includes('404') || message.includes('noch keine Daten');
  return (
    <div className="card p-6 text-sm" role="alert">
      <strong>{missing ? 'Diese Daten sind noch nicht verfügbar.' : 'Daten konnten nicht geladen werden.'}</strong>
      <p className="mt-2 max-w-lg leading-relaxed text-(--color-ink-2)">{missing ? 'Der Eintrag ist in dieser Saison noch nicht vorhanden. Du kannst eine andere Saison oder Liga auswählen.' : 'Bitte prüfe deine Verbindung und versuche es erneut. Bereits geladene Daten bleiben verfügbar.'}</p>
      <button className="button-secondary mt-4" disabled={retrying} onClick={async () => { setRetrying(true); try { await client.refetchQueries({ type: 'active' }); } finally { setRetrying(false); } }}>{retrying ? 'Wird geladen …' : 'Erneut versuchen'}<Icon name="arrow" size={16} /></button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-(--color-line) px-6 py-10 text-center text-sm leading-relaxed text-(--color-ink-2)">{children}</div>;
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-action">
      {children}
    </Link>
  );
}
