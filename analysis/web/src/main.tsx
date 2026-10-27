import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { loadDatabase, rows } from './db.ts';
import { Select } from './components.tsx';
import { LEVELS, leagueWhere, describeScope, type Filters } from './scope.ts';
import { Overview } from './views/Overview.tsx';
import { Teams } from './views/Teams.tsx';
import { Timeline } from './views/Timeline.tsx';
import { Strength } from './views/Strength.tsx';
import { Players } from './views/Players.tsx';
import { Games } from './views/Games.tsx';
import { SqlConsole } from './views/SqlConsole.tsx';

const TABS = [
  ['overview', 'Überblick', Overview],
  ['teams', 'Teams', Teams],
  ['timeline', 'Spielverlauf', Timeline],
  ['strength', 'Über-/Unterzahl', Strength],
  ['players', 'Spieler', Players],
  ['games', 'Spiele', Games],
  ['sql', 'SQL', SqlConsole],
] as const;
type Tab = (typeof TABS)[number][0];

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return {
    tab: (TABS.some(([t]) => t === p.get('tab')) ? p.get('tab') : 'overview') as Tab,
    filters: { season: Number(p.get('s')) || 0, gender: p.get('g') ?? '', level: p.get('lv') ?? '', league: Number(p.get('l')) || 0, team: Number(p.get('t')) || 0 },
  };
}

function App() {
  const [status, setStatus] = useState<string | null>('Starte …');
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(readHash, []);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [f, setF] = useState<Filters>(initial.filters);

  useEffect(() => {
    loadDatabase(setStatus).then(() => {
      setF((cur) => (cur.season ? cur : { ...cur, season: rows<{ id: number }>('SELECT id FROM seasons ORDER BY is_current DESC, id DESC LIMIT 1')[0]?.id ?? 0 }));
      setStatus(null);
    }).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const p = new URLSearchParams({ tab });
    if (f.season) p.set('s', String(f.season));
    if (f.gender) p.set('g', f.gender);
    if (f.level) p.set('lv', f.level);
    if (f.league) p.set('l', String(f.league));
    if (f.team) p.set('t', String(f.team));
    history.replaceState(null, '', `#${p}`);
  }, [tab, f]);

  if (error) return <main className="loading error">Fehler: {error}</main>;
  if (status) return <main className="loading">{status}</main>;

  const meta = Object.fromEntries(rows<{ key: string; value: string }>('SELECT key, value FROM meta').map((r) => [r.key, r.value]));
  const seasons = rows<{ id: number; name: string }>('SELECT id, name FROM seasons ORDER BY id DESC');
  const leagues = rows<{ id: number; name: string; short: string }>(`SELECT l.id, l.name, l.short FROM leagues l
    WHERE ${leagueWhere({ ...f, league: 0 })} ORDER BY l.gender DESC, l.level_rank, l.staffel`);
  const teams = rows<{ id: number; name: string }>(`SELECT t.id, t.name || ' (' || l.short || ')' AS name FROM teams t JOIN leagues l ON l.id = t.league_id
    WHERE ${leagueWhere(f)} ORDER BY t.name`);
  const set = (patch: Partial<Filters>) => setF((cur) => {
    const next = { ...cur, ...patch };
    if (!('league' in patch) && ('gender' in patch || 'level' in patch || 'season' in patch)) next.league = 0;
    if (!('team' in patch)) next.team = 0;
    return next;
  });
  const View = TABS.find(([t]) => t === tab)![2];
  const updated = new Date(meta.data_updated_at);

  return (
    <>
      <header className="top">
        <div className="brand">
          <strong>Handball BW · Statistik</strong>
          <span className="muted">Datenstand {updated.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · {meta.reports} Spielberichte / {meta.games} Spiele</span>
        </div>
        <a href="../" className="muted">← zur App</a>
      </header>
      <div className="filters">
        <Select label="Saison" value={f.season} options={seasons.map((s) => ({ value: s.id, label: s.name }))} onChange={(season) => set({ season })} />
        <Select label="Geschlecht" value={f.gender} options={[{ value: '', label: 'Alle' }, { value: 'Männer', label: 'Männer' }, { value: 'Frauen', label: 'Frauen' }]} onChange={(gender) => set({ gender })} />
        <Select label="Spielklasse" value={f.level} options={[{ value: '', label: 'Alle' }, ...Object.entries(LEVELS).map(([value, label]) => ({ value, label }))]} onChange={(level) => set({ level })} />
        <Select label="Liga" value={f.league} options={[{ value: 0, label: 'Alle' }, ...leagues.map((l) => ({ value: l.id, label: `${l.short} – ${l.name}` }))]} onChange={(league) => set({ league })} />
        <Select label="Team" value={f.team} options={[{ value: 0, label: 'Alle' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]} onChange={(team) => set({ team })} />
      </div>
      <nav className="tabs">
        {TABS.map(([id, label]) => <button key={id} className={id === tab ? 'active' : undefined} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <main>
        <p className="scope">{describeScope(f, leagues, teams)}</p>
        <View f={f} setFilters={set} />
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
