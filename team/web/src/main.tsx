import { StrictMode, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { CONFIG, forget, hasRememberedKey, reload, unlock, WrongKeyError } from './data.ts';
import type { TeamBundle } from '../../lib/model.ts';
import { TeamContext, href, loadFilters, saveFilters, selectGames, useRoute, useTeam, type Filters, type Selection } from './state.tsx';
import { fmtDate, Segmented } from './ui.tsx';
import { Overview } from './views/Overview.tsx';
import { PlayersView } from './views/Players.tsx';
import { PlayerView } from './views/Player.tsx';
import { GamesView } from './views/Games.tsx';
import { GameView } from './views/Game.tsx';
import { UploadView } from './views/Upload.tsx';

interface Session {
  bundle: TeamBundle;
  ref: string;
  key: CryptoKey;
}

function Lock({ onOpen }: { onOpen: (s: Session) => void }) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onOpen(await unlock(password, remember));
    } catch (err) {
      setError(err instanceof WrongKeyError ? 'Das Passwort stimmt nicht.' : (err as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="lock">
      <form className="lock-card" onSubmit={submit}>
        <div className="lock-mark" aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><rect x="4.5" y="10" width="15" height="11" rx="2.5" fill="currentColor" /></svg>
        </div>
        <h1>{CONFIG.team}</h1>
        <p className="lock-sub">Interne Mannschaftsstatistik</p>
        <label className="field">
          <span>Mannschafts-Passwort</span>
          <input type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Auf diesem Gerät angemeldet bleiben
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !password}>
          {busy ? 'Entschlüssele …' : 'Öffnen'}
        </button>
      </form>
    </main>
  );
}

const SELECTIONS: [Selection, string][] = [
  ['all', 'Alle'],
  ['last5', 'Letzte 5'],
  ['last3', 'Letzte 3'],
  ['home', 'Heim'],
  ['away', 'Auswärts'],
  ['wins', 'Siege'],
  ['losses', 'Niederlagen'],
];

function GamePicker() {
  const { bundle, filters, setFilters } = useTeam();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const sorted = [...bundle.games].sort((a, b) => b.date.localeCompare(a.date));
  const current = new Set(selectGames(bundle.games, filters).map((g) => g.id));
  const toggle = (id: string) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFilters({ ...filters, selection: 'custom', custom: [...next] });
  };
  return (
    <div className="picker" ref={ref}>
      <button className={`chip${filters.selection === 'custom' ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        Auswahl … {filters.selection === 'custom' ? `(${current.size})` : ''}
      </button>
      {open && (
        <div className="picker-pop">
          <div className="picker-actions">
            <button onClick={() => setFilters({ ...filters, selection: 'custom', custom: bundle.games.map((g) => g.id) })}>Alle</button>
            <button onClick={() => setFilters({ ...filters, selection: 'custom', custom: [] })}>Keine</button>
          </div>
          {sorted.map((g) => (
            <label key={g.id} className="picker-row">
              <input type="checkbox" checked={current.has(g.id)} onChange={() => toggle(g.id)} />
              <span className="picker-date">{fmtDate(g.date, false)}</span>
              <span className="picker-opp">{g.opponent}</span>
              <span className="picker-score">{g.goalsFor}:{g.goalsAgainst}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar() {
  const { bundle, games, filters, setFilters } = useTeam();
  return (
    <div className="filterbar">
      <div className="chips" role="group" aria-label="Spiele auswählen">
        {SELECTIONS.map(([v, label]) => (
          <button key={v} className={`chip${filters.selection === v ? ' on' : ''}`} aria-pressed={filters.selection === v} onClick={() => setFilters({ ...filters, selection: v })}>
            {label}
          </button>
        ))}
        <GamePicker />
      </div>
      <div className="filter-right">
        <span className="filter-count">{games.length} von {bundle.games.length} Spielen</span>
        <Segmented label="Halbzeit" value={filters.half} onChange={(half) => setFilters({ ...filters, half })} options={[[0, 'Gesamt'], [1, '1. HZ'], [2, '2. HZ']]} />
      </div>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const { bundle, logout } = useTeam();
  const tabs: [string, string, boolean][] = [
    [href.overview, 'Übersicht', route.page === 'overview'],
    [href.players, 'Spieler', route.page === 'players' || route.page === 'player'],
    [href.games, 'Spiele', route.page === 'games' || route.page === 'game'],
  ];
  const showFilter = route.page !== 'upload' && route.page !== 'game';
  return (
    <>
      <header className="masthead">
        <div className="masthead-inner">
          <a href={href.overview} className="brand">
            <span className="brand-mark" aria-hidden>{CONFIG.team.split(' ').at(-1)?.[0]}</span>
            <span>
              <strong>{CONFIG.team}</strong>
              <small>Interne Statistik{bundle.builtAt ? ` · Stand ${fmtDate(bundle.builtAt, false)}` : ''}</small>
            </span>
          </a>
          <div className="masthead-actions">
            <a href={href.upload} className={`btn btn-ghost${route.page === 'upload' ? ' on' : ''}`}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M12 16V4m0 0-5 5m5-5 5 5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Hochladen</span>
            </a>
            <button className="btn btn-ghost" onClick={logout} title="Abmelden">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="hide-sm">Abmelden</span>
            </button>
          </div>
        </div>
        <nav className="tabs" aria-label="Bereiche">
          {tabs.map(([h, label, on]) => (
            <a key={h} href={h} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
      </header>
      <main className="page">
        {showFilter && bundle.games.length > 0 && <FilterBar />}
        {route.page === 'overview' && <Overview />}
        {route.page === 'players' && <PlayersView />}
        {route.page === 'player' && <PlayerView playerKey={route.key} />}
        {route.page === 'games' && <GamesView />}
        {route.page === 'game' && <GameView id={route.id} />}
        {route.page === 'upload' && <UploadView />}
      </main>
    </>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(hasRememberedKey);
  const [filters, setFiltersState] = useState<Filters>(loadFilters);

  useEffect(() => {
    if (!booting) return;
    unlock(null, true).then(setSession, () => forget()).finally(() => setBooting(false));
  }, [booting]);

  const value = useMemo(() => {
    if (!session) return null;
    return {
      ...session,
      games: selectGames(session.bundle.games, filters),
      filters,
      setFilters: (f: Filters) => {
        setFiltersState(f);
        saveFilters(f);
      },
      refresh: async () => {
        const next = await reload(session.key);
        setSession({ ...session, ...next });
      },
      logout: () => {
        forget();
        setSession(null);
        location.hash = '';
      },
    };
  }, [session, filters]);

  if (booting) return <main className="lock"><p className="lock-sub">Lade …</p></main>;
  if (!value) return <Lock onOpen={setSession} />;
  return (
    <TeamContext.Provider value={value}>
      <Shell />
    </TeamContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
