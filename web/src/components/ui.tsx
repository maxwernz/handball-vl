import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function LiveBadge({ small }: { small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-(--color-live) font-bold tracking-wide text-white ${small ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}
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
        <span key={i} title={title[f]} className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${style[f]}`}>
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
      className={`self-start rounded-full p-2 text-2xl leading-none transition hover:bg-(--color-surface-2) ${on ? 'text-(--color-draw)' : 'text-(--color-ink-3)'}`}
    >
      {on ? '★' : '☆'}
    </button>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-end justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold tracking-wide text-(--color-ink-2) uppercase">{title}</h2>
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
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${value === t.id ? 'bg-(--color-surface) text-(--color-ink) shadow-sm' : 'text-(--color-ink-2) hover:text-(--color-ink)'}`}
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
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${value === o.id ? 'border-(--color-brand) bg-(--color-brand) text-white' : 'border-(--color-line) bg-(--color-surface) text-(--color-ink-2) hover:text-(--color-ink)'}`}
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
      <div className="tabular mt-0.5 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-(--color-ink-2)">{hint}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-20 animate-pulse bg-(--color-surface-2)" />
      ))}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="card border-(--color-loss) p-4 text-sm">
      <strong>Daten konnten nicht geladen werden.</strong>
      <div className="mt-1 text-(--color-ink-2)">{error instanceof Error ? error.message : String(error)}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card p-6 text-center text-sm text-(--color-ink-2)">{children}</div>;
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-medium text-(--color-brand) hover:underline">
      {children}
    </Link>
  );
}
