import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { TeamDetail } from '../../../shared/types.ts';
import { useTeam } from '../api.ts';
import { PeriodBars } from '../components/charts.tsx';
import { GameList } from '../components/GameRow.tsx';
import { PlayerTable, type PlayerView } from '../components/StatTables.tsx';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Chips, Empty, ErrorBox, FormBadges, Loading, Section, StatTile, Tabs, TextLink } from '../components/ui.tsx';
import { toggleFavorite, useFavorites } from '../lib/favorites.ts';
import { perGame, percent, signed } from '../lib/format.ts';

type Tab = 'games' | 'squad' | 'stats';

function Record({ label, r }: { label: string; r: { won: number; drawn: number; lost: number } }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-(--color-ink-2)">{label}</span>
      <span className="tabular font-semibold">
        <span className="text-(--color-win)">{r.won} S</span> · <span className="text-(--color-draw)">{r.drawn} U</span> ·{' '}
        <span className="text-(--color-loss)">{r.lost} N</span>
      </span>
    </div>
  );
}

function StatsTab({ data }: { data: TeamDetail }) {
  const s = data.stats;
  if (!s.played) return <Empty>Noch keine Spiele gespielt.</Empty>;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-(--color-ink-2)">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="mb-2 font-semibold">Tore nach Spielabschnitt</h3>
        {s.reports ? (
          <PeriodBars
            series={[
              { label: 'Erzielt', values: s.goalsForByPeriod, color: 'var(--color-home)' },
              { label: 'Kassiert', values: s.goalsAgainstByPeriod, color: 'var(--color-guest)' },
            ]}
          />
        ) : (
          <p className="text-sm text-(--color-ink-2)">Noch keine Spielberichte vorhanden.</p>
        )}
      </div>
      <div className="card divide-y divide-(--color-line) px-4 py-2">
        <Record label="Heim" r={s.home} />
        <Record label="Auswärts" r={s.away} />
        {row('Zur Halbzeit geführt', `${s.leadAtHalf} von ${s.played}`)}
        {row('Siege nach Halbzeitrückstand', s.comebacks)}
        {row(
          'Höchster Sieg',
          s.biggestWin ? <Link className="hover:underline" to={`/spiel/${s.biggestWin.gameId}`}>{s.biggestWin.score} (+{s.biggestWin.diff})</Link> : '–',
        )}
        {row(
          'Höchste Niederlage',
          s.biggestLoss ? <Link className="hover:underline" to={`/spiel/${s.biggestLoss.gameId}`}>{s.biggestLoss.score} (−{s.biggestLoss.diff})</Link> : '–',
        )}
        {row('7-Meter', `${s.sevenGoals}/${s.sevenAttempts} (${percent(s.sevenGoals, s.sevenAttempts)})`)}
        {row('Zeitstrafen', `${s.twoMinutes} (Ø ${perGame(s.twoMinutes, s.reports)})`)}
        {row('Verwarnungen / Disqualifikationen', `${s.warnings} / ${s.disqualifications}`)}
        {row('Genommene Auszeiten', s.timeouts)}
        {row('Zuschauer pro Heimspiel', s.avgSpectators ?? '–')}
      </div>
    </div>
  );
}

export function TeamPage() {
  const id = Number(useParams().id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'games';
  const [playerView, setPlayerView] = useState<PlayerView>('goals');
  const { data, isLoading, error } = useTeam(id);
  const favorites = useFavorites();

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const { team, league, tableRow, stats, games } = data;
  const isFav = favorites.includes(team.name);
  const next = games.find((g) => g.status !== 'finished');
  const played = games.filter((g) => g.status === 'finished').reverse();
  const upcoming = games.filter((g) => g.status !== 'finished');

  return (
    <div>
      <div className="card mb-4 flex items-center gap-4 p-4">
        <TeamLogo teamId={team.id} name={team.name} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-tight font-bold">{team.name}</h1>
          <Link to={`/liga/${league.id}`} className="text-sm text-(--color-ink-2) hover:underline">
            {league.name}
          </Link>
          <div className="mt-2">
            <FormBadges form={stats.form} />
          </div>
        </div>
        <button
          onClick={() => toggleFavorite(team.name)}
          aria-pressed={isFav}
          aria-label={isFav ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
          className={`self-start rounded-full p-2 text-2xl leading-none transition hover:bg-(--color-surface-2) ${isFav ? 'text-(--color-draw)' : 'text-(--color-ink-3)'}`}
        >
          {isFav ? '★' : '☆'}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Platz" value={tableRow?.rank ?? '–'} hint={tableRow ? `${tableRow.pointsPlus}:${tableRow.pointsMinus} Punkte` : undefined} />
        <StatTile label="Bilanz" value={`${stats.won}-${stats.drawn}-${stats.lost}`} hint="Siege-Unentsch.-Niederl." />
        <StatTile label="Tore Ø" value={perGame(stats.goalsFor, stats.played)} hint={`Gegentore Ø ${perGame(stats.goalsAgainst, stats.played)}`} />
        <StatTile label="Tordifferenz" value={signed(stats.goalsFor - stats.goalsAgainst)} hint={`${stats.goalsFor}:${stats.goalsAgainst}`} />
      </div>

      {next && (
        <Section title={next.status === 'live' ? 'Läuft gerade' : 'Nächstes Spiel'}>
          <GameList games={[next]} perspective={team.id} />
        </Section>
      )}

      <Tabs
        tabs={[
          { id: 'games', label: 'Spiele' },
          { id: 'squad', label: 'Kader' },
          { id: 'stats', label: 'Statistik' },
        ]}
        value={tab}
        onChange={(t) => setParams(t === 'games' ? {} : { tab: t }, { replace: true })}
      />

      {tab === 'games' && (
        <>
          {played.length > 0 && (
            <Section title="Ergebnisse">
              <GameList games={played} perspective={team.id} />
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="Kommende Spiele">
              <GameList games={upcoming} perspective={team.id} />
            </Section>
          )}
        </>
      )}

      {tab === 'squad' &&
        (data.players.length ? (
          <>
            <Chips
              options={[
                { id: 'goals', label: 'Tore' },
                { id: 'seven', label: '7-Meter' },
                { id: 'penalties', label: 'Strafen' },
              ]}
              value={playerView}
              onChange={setPlayerView}
            />
            <PlayerTable players={data.players} view={playerView} showTeam={false} limit={40} />
            <p className="mt-2 px-1 text-xs text-(--color-ink-3)">
              Aus {stats.reports} Spielberichten. Spieler ohne veröffentlichten Namen sind nicht aufgeführt.
            </p>
          </>
        ) : (
          <Empty>Noch keine Spielberichte – der Kader erscheint nach dem ersten Spiel.</Empty>
        ))}

      {tab === 'stats' && <StatsTab data={data} />}

      <div className="mt-6 text-center">
        <TextLink to={`/liga/${league.id}`}>Zur Tabelle der {league.short}</TextLink>
      </div>
    </div>
  );
}
