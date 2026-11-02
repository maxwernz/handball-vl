import { useMemo } from 'react';
import { ZONES } from '../../../lib/model.ts';
import { emptyLine, mergeLines, pct, players, resultOf, summarize } from '../../../lib/stats.ts';
import { PairColumns, ZoneBars } from '../charts.tsx';
import { go, href, useTeam } from '../state.tsx';
import { Card, Empty, Legend, Tile, fmtDate, fmtNum, fmtPct, shortName, venue } from '../ui.tsx';

const SEGMENTS = ['0–10', '11–20', '21–30', '31–40', '41–50', '51–60'];

export function Overview() {
  const { bundle, games, filters } = useTeam();
  const half = filters.half;
  const data = useMemo(() => {
    const sums = games.map((g) => summarize(g, half));
    const team = sums.reduce((acc, s) => mergeLines(acc, s.team), emptyLine());
    const oppZones = Object.fromEntries(ZONES.map((z) => [z, sums.reduce((a, s) => [a[0] + s.oppZones[z][0], a[1] + s.oppZones[z][1]], [0, 0])])) as Record<string, [number, number]>;
    const segments = SEGMENTS.map((_, i) => sums.reduce((a, s) => ({ for: a.for + s.segments[i].for, against: a.against + s.segments[i].against }), { for: 0, against: 0 }));
    const goalsFor = sums.reduce((a, s) => a + s.for, 0);
    const goalsAgainst = sums.reduce((a, s) => a + s.against, 0);
    const record = { S: 0, U: 0, N: 0 };
    for (const g of games) record[resultOf(g)]++;
    return { sums, team, oppZones, segments, goalsFor, goalsAgainst, record, list: players(games, half, bundle.aliases) };
  }, [games, half, bundle.aliases]);

  if (!bundle.games.length) {
    return (
      <Empty>
        <h2>Noch keine Spiele</h2>
        <p>Sobald die erste Statistik hochgeladen ist, erscheint hier die Auswertung.</p>
        <a className="btn btn-primary" href={href.upload}>Erstes Spiel hochladen</a>
      </Empty>
    );
  }
  if (!games.length) return <Empty><h2>Keine Spiele in dieser Auswahl</h2><p>Wähle oben andere Spiele aus.</p></Empty>;

  const n = games.length;
  const { team, record } = data;
  const seven = team.zones['7m'];
  const keepers = data.list.filter((p) => p.line.faced > 0).sort((a, b) => b.line.faced - a.line.faced);
  const top = (pick: (l: typeof team) => number, min = 1) =>
    data.list.map((p) => ({ p, v: pick(p.line) })).filter((x) => x.v >= min).sort((a, b) => b.v - a.v).slice(0, 5);
  const shooters = data.list
    .filter((p) => p.line.shots >= Math.max(5, 2 * n))
    .map((p) => ({ p, v: p.line.goals / p.line.shots }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);
  const halfNote = half ? ` · nur ${half}. Halbzeit` : '';

  return (
    <div className="stack">
      <div className="tiles">
        <Tile accent label="Bilanz" value={<>{record.S}<span className="sep">–</span>{record.U}<span className="sep">–</span>{record.N}</>} sub={`Sieg – Remis – Niederlage${half ? ' (Endstand)' : ''}`} />
        <Tile label="Tore / Spiel" value={fmtNum(data.goalsFor / n)} sub={`${data.goalsFor} gesamt`} />
        <Tile label="Gegentore / Spiel" value={fmtNum(data.goalsAgainst / n)} sub={`Differenz ${data.goalsFor - data.goalsAgainst > 0 ? '+' : ''}${data.goalsFor - data.goalsAgainst}`} />
        <Tile label="Wurfquote" value={fmtPct(pct(team.goals, team.shots))} sub={`${team.goals} von ${team.shots} Würfen`} />
        <Tile label="Paradenquote" value={fmtPct(pct(team.saves, team.faced))} sub={`${team.saves} von ${team.faced} Würfen`} />
        <Tile label="7m-Quote" value={fmtPct(pct(seven[0], seven[1]))} sub={`${seven[0]}/${seven[1]} · ${team.sevenWon} herausgeholt`} />
        <Tile label="Ballverluste / Spiel" value={fmtNum(team.turnovers / n)} sub={`${fmtNum(team.steals / n)} Ballgewinne pro Spiel`} />
        <Tile label="Zeitstrafen / Spiel" value={fmtNum(team.twoMin / n)} sub={`${team.yellow} Gelb · ${team.red} Rot`} />
      </div>

      <Card title="Ergebnisse" sub={`Tore und Gegentore je Spiel${halfNote}. Klick auf ein Spiel öffnet die Details.`} actions={<Legend items={[['we', 'Wir'], ['opp', 'Gegner']]} />}>
        <PairColumns
          ariaLabel="Tore und Gegentore je Spiel"
          groups={data.sums.map((s) => ({
            key: s.game.id,
            label: shortName(s.game.opponent, 12),
            sub: fmtDate(s.game.date, false),
            a: s.for,
            b: s.against,
            onClick: () => go(href.game(s.game.id)),
            tip: (
              <>
                <b>{fmtDate(s.game.date)} {venue(s.game)} {s.game.opponent}</b>
                <br />
                {half ? `${half}. HZ ${s.for}:${s.against} · ` : ''}Endstand {s.game.goalsFor}:{s.game.goalsAgainst}
              </>
            ),
          }))}
        />
      </Card>

      <div className="grid-2">
        <Card title="Wurfbild" sub="Trefferquote je Position: unsere Würfe und die Würfe des Gegners auf unser Tor." actions={<Legend items={[['we', 'Wir'], ['opp', 'Gegner']]} />}>
          <ZoneBars aLabel="Wir" bLabel="Gegner" rows={ZONES.map((z) => ({ label: z, a: team.zones[z], b: data.oppZones[z] }))} />
        </Card>
        <Card title="Tore nach Spielphase" sub={`Summe über ${n} ${n === 1 ? 'Spiel' : 'Spiele'}, je 10 Minuten.`} actions={<Legend items={[['we', 'Wir'], ['opp', 'Gegner']]} />}>
          <PairColumns
            ariaLabel="Tore und Gegentore je 10 Minuten"
            groups={data.segments.map((s, i) => ({ key: SEGMENTS[i], label: `${SEGMENTS[i]}'`, a: s.for, b: s.against, tip: <><b>Minute {SEGMENTS[i]}</b><br />{s.for}:{s.against} ({s.for - s.against > 0 ? '+' : ''}{s.for - s.against})</> }))}
          />
        </Card>
      </div>

      <div className="grid-3">
        <Leaders title="Torschützen" rows={top((l) => l.goals).map(({ p, v }) => ({ key: p.key, name: p.name, no: p.no, value: String(v), sub: `${fmtNum(v / p.games)} pro Spiel` }))} />
        <Leaders title="Beste Wurfquote" hint={`ab ${Math.max(5, 2 * n)} Würfen`} rows={shooters.map(({ p, v }) => ({ key: p.key, name: p.name, no: p.no, value: fmtPct(v), sub: `${p.line.goals}/${p.line.shots}` }))} />
        <Leaders
          title="Torhüter"
          rows={keepers.map((p) => ({ key: p.key, name: p.name, no: p.no, value: fmtPct(pct(p.line.saves, p.line.faced)), sub: `${p.line.saves} Paraden / ${p.line.faced}` }))}
        />
        <Leaders title="Ballgewinne" rows={top((l) => l.steals + l.forcedSteals).map(({ p, v }) => ({ key: p.key, name: p.name, no: p.no, value: String(v), sub: `${p.line.fouls} Stopfouls` }))} />
        <Leaders title="7m herausgeholt" rows={top((l) => l.sevenWon).map(({ p, v }) => ({ key: p.key, name: p.name, no: p.no, value: String(v), sub: '' }))} />
        <Leaders title="Ballverluste" rows={top((l) => l.turnovers).map(({ p, v }) => ({ key: p.key, name: p.name, no: p.no, value: String(v), sub: `${fmtNum(v / p.games)} pro Spiel` }))} />
      </div>
    </div>
  );
}

function Leaders({ title, hint, rows }: { title: string; hint?: string; rows: { key: string; name: string; no: string; value: string; sub: string }[] }) {
  return (
    <Card title={title} sub={hint} className="leaders">
      {rows.length ? (
        <ol>
          {rows.map((r, i) => (
            <li key={r.key}>
              <a href={href.player(r.key)}>
                <span className="rank">{i + 1}</span>
                <span className="who">
                  <span className="name">{r.name}</span>
                  <span className="meta">#{r.no}{r.sub ? ` · ${r.sub}` : ''}</span>
                </span>
                <span className="val">{r.value}</span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small">Keine Daten in dieser Auswahl.</p>
      )}
    </Card>
  );
}
