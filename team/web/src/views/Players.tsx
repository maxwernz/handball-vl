import { useMemo, useState } from 'react';
import { pct, players, type Line, type PlayerAgg } from '../../../lib/stats.ts';
import { go, href, useTeam } from '../state.tsx';
import { Card, Empty, Glossary, Segmented, SortTable, fmtNum, fmtPct, type Column } from '../ui.tsx';

type Mode = 'sum' | 'avg';

interface Stat {
  key: string;
  label: string;
  title: string;
  get: (l: Line) => number;
}

export const FIELD_STATS: Stat[] = [
  { key: 'goals', label: 'Tore', title: 'Tore', get: (l) => l.goals },
  { key: 'shots', label: 'Würfe', title: 'Würfe (Tore + Fehlwürfe)', get: (l) => l.shots },
  { key: 'seven', label: '7m', title: '7m-Tore', get: (l) => l.zones['7m'][0] },
  { key: 'assists', label: 'Ass.', title: 'Assists', get: (l) => l.assists },
  { key: 'steals', label: 'BG', title: 'Ballgewinne', get: (l) => l.steals },
  { key: 'forced', label: 'BGE', title: 'Ballgewinne erzwungen', get: (l) => l.forcedSteals },
  { key: 'turnovers', label: 'BV', title: 'Ballverluste', get: (l) => l.turnovers },
  { key: 'fouls', label: 'SF', title: 'Stopfouls', get: (l) => l.fouls },
  { key: 'sevenWon', label: '+7', title: '7m herausgeholt', get: (l) => l.sevenWon },
  { key: 'sevenCaused', label: '−7', title: '7m verursacht', get: (l) => l.sevenCaused },
  { key: 'twoMin', label: "2'", title: 'Zeitstrafen', get: (l) => l.twoMin },
  { key: 'yellow', label: 'G', title: 'Gelbe Karten', get: (l) => l.yellow },
  { key: 'red', label: 'R', title: 'Rote Karten', get: (l) => l.red },
];

export const GLOSSARY: [string, string][] = [
  ['Quote', 'Tore pro Wurf'],
  ['7m', '7m-Tore (Versuche in Klammern beim Spieler)'],
  ['Ass.', 'Assists'],
  ['BG', 'Ballgewinne'],
  ['BGE', 'Ballgewinne erzwungen'],
  ['BV', 'Ballverluste'],
  ['SF', 'Stopfouls'],
  ['+7 / −7', '7m herausgeholt / verursacht'],
  ["2'", 'Zeitstrafen'],
  ['G / R', 'Gelbe / Rote Karten'],
];

const fmt = (v: number, mode: Mode) => (mode === 'avg' ? fmtNum(v, 1) : String(v));

/** Field-player table, reused for one game (games=1) and for any selection. */
export function FieldTable({ list, mode, onRow }: { list: PlayerAgg[]; mode: Mode; onRow?: (p: PlayerAgg) => void }) {
  const div = (p: PlayerAgg) => (mode === 'avg' ? Math.max(1, p.games) : 1);
  const used = FIELD_STATS.filter((s) => s.key === 'goals' || s.key === 'shots' || list.some((p) => s.get(p.line) > 0));
  const columns: Column<PlayerAgg>[] = [
    { key: 'no', label: 'Nr', value: (p) => Number(p.no) || 0, render: (p) => <span className="no">{p.no}</span>, className: 'num narrow', desc: false },
    { key: 'name', label: 'Spieler', value: (p) => p.name, render: (p) => <span className="player-name">{p.name}</span>, className: 'name', desc: false },
    { key: 'games', label: 'Sp', title: 'Spiele', value: (p) => p.games, className: 'num' },
    ...used.slice(0, 2).map((s) => ({ key: s.key, label: s.label, title: s.title, value: (p: PlayerAgg) => s.get(p.line) / div(p), render: (p: PlayerAgg) => fmt(s.get(p.line) / div(p), mode), className: `num${s.key === 'goals' ? ' strong' : ''}` })),
    {
      key: 'quote', label: 'Quote', title: 'Wurfquote', value: (p) => pct(p.line.goals, p.line.shots),
      render: (p) => <QuoteCell v={pct(p.line.goals, p.line.shots)} />, className: 'num',
    },
    ...used.slice(2).map((s) => ({
      key: s.key, label: s.label, title: s.title, value: (p: PlayerAgg) => s.get(p.line) / div(p), className: 'num',
      render: (p: PlayerAgg) => {
        const v = s.get(p.line) / div(p);
        if (s.key === 'seven') return p.line.zones['7m'][1] ? <>{fmt(v, mode)}<span className="muted">/{fmt(p.line.zones['7m'][1] / div(p), mode)}</span></> : <span className="muted">–</span>;
        return v ? fmt(v, mode) : <span className="muted">·</span>;
      },
    })),
  ];
  return <SortTable rows={list} columns={columns} initial="goals" rowKey={(p) => p.key} onRow={onRow} />;
}

export function KeeperTable({ list, onRow }: { list: PlayerAgg[]; onRow?: (p: PlayerAgg) => void }) {
  const columns: Column<PlayerAgg>[] = [
    { key: 'no', label: 'Nr', value: (p) => Number(p.no) || 0, render: (p) => <span className="no">{p.no}</span>, className: 'num narrow', desc: false },
    { key: 'name', label: 'Torhüter', value: (p) => p.name, render: (p) => <span className="player-name">{p.name}</span>, className: 'name', desc: false },
    { key: 'games', label: 'Sp', title: 'Spiele', value: (p) => p.games, className: 'num' },
    { key: 'saves', label: 'Paraden', value: (p) => p.line.saves, className: 'num strong' },
    { key: 'faced', label: 'Würfe', title: 'Würfe aufs Tor', value: (p) => p.line.faced, className: 'num' },
    { key: 'quote', label: 'Quote', title: 'Paradenquote', value: (p) => pct(p.line.saves, p.line.faced), render: (p) => <QuoteCell v={pct(p.line.saves, p.line.faced)} />, className: 'num' },
    { key: 'seven', label: '7m', title: '7m gehalten / 7m aufs Tor', value: (p) => p.line.keeperZones['7m'][0], render: (p) => <>{p.line.keeperZones['7m'][0]}<span className="muted">/{p.line.keeperZones['7m'][1]}</span></>, className: 'num' },
    { key: 'six', label: '6m', title: 'Paraden / Würfe vom Kreis', value: (p) => pct(...p.line.keeperZones['6m']), render: (p) => <>{p.line.keeperZones['6m'][0]}<span className="muted">/{p.line.keeperZones['6m'][1]}</span></>, className: 'num' },
    { key: 'wing', label: 'Flügel', value: (p) => pct(...p.line.keeperZones['Flügel']), render: (p) => <>{p.line.keeperZones['Flügel'][0]}<span className="muted">/{p.line.keeperZones['Flügel'][1]}</span></>, className: 'num' },
    { key: 'nine', label: '9m', title: 'Paraden / Würfe aus dem Rückraum', value: (p) => pct(...p.line.keeperZones['9m']), render: (p) => <>{p.line.keeperZones['9m'][0]}<span className="muted">/{p.line.keeperZones['9m'][1]}</span></>, className: 'num' },
  ];
  return <SortTable rows={list} columns={columns} initial="faced" rowKey={(p) => p.key} onRow={onRow} />;
}

export function QuoteCell({ v }: { v: number | null }) {
  if (v === null) return <span className="muted">–</span>;
  return (
    <span className="quote">
      <span className="quote-bar" aria-hidden><i style={{ width: `${v * 100}%` }} /></span>
      {fmtPct(v)}
    </span>
  );
}

export function PlayersView() {
  const { bundle, games, filters } = useTeam();
  const [mode, setMode] = useState<Mode>('sum');
  const list = useMemo(() => players(games, filters.half, bundle.aliases), [games, filters.half, bundle.aliases]);
  if (!games.length) return <Empty><h2>Keine Spiele ausgewählt</h2></Empty>;
  const field = list.filter((p) => p.line.shots > 0 || p.line.faced === 0);
  const keepers = list.filter((p) => p.line.faced > 0);
  const open = (p: PlayerAgg) => go(href.player(p.key));
  return (
    <div className="stack">
      <Card
        title="Feldspieler"
        sub={`${field.length} Spieler · Klick auf eine Zeile öffnet das Spielerprofil`}
        actions={<Segmented label="Werte" value={mode} onChange={setMode} options={[['sum', 'Summe'], ['avg', 'Ø pro Spiel']]} />}
      >
        <FieldTable list={field} mode={mode} onRow={open} />
        <Glossary items={GLOSSARY} />
      </Card>
      {keepers.length > 0 && (
        <Card title="Torhüter" sub="Paraden je Wurfposition: gehalten / Würfe aufs Tor">
          <KeeperTable list={keepers} onRow={open} />
        </Card>
      )}
    </div>
  );
}
