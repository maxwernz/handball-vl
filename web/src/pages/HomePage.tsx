import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Game, Meta } from '../../../shared/types.ts';
import { useGames, useLiveGames, useMeta } from '../api.ts';
import { GameList } from '../components/GameRow.tsx';
import { Icon } from '../components/Icon.tsx';
import { LeagueDirectory } from '../components/LeagueDirectory.tsx';
import { MatchdayHighlights } from '../components/MatchdayHighlights.tsx';
import { TeamLogo } from '../components/TeamLogo.tsx';
import { Chips, Empty, ErrorBox, LiveBadge, Loading, Section, TextLink } from '../components/ui.tsx';
import { setFavorites, shareLink, toggleFavorite, toggleFavoriteLeague, useFavoriteLeagues, useFavorites, useFavoriteTeamIds } from '../lib/favorites.ts';
import { formatDay, isoDay, leagueLabel, relativeDay } from '../lib/format.ts';
import { matcher } from '../lib/search.ts';

function berlinToday() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function shiftDay(day: string, by: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}
function monday(day: string) {
  return shiftDay(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
}

function MatchCenter({ meta, mine }: { meta: Meta; mine: ((game: Game) => boolean) | null }) {
  const { data: games, isPending, error } = useGames();
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState('all');
  const [league, setLeague] = useState('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [limit, setLimit] = useState(40);
  const today = berlinToday();
  const currentWeek = monday(today);
  const defaultWeek = useMemo(() => {
    if (!games?.length || games.some((game) => isoDay(game.date) >= currentWeek && isoDay(game.date) < shiftDay(currentWeek, 7))) return currentWeek;
    const sorted = [...games].sort((a, b) => a.ts - b.ts);
    const next = sorted.find((game) => isoDay(game.date) >= today);
    return monday(isoDay((next ?? sorted.at(-1)!).date));
  }, [games, currentWeek, today]);
  const week = selectedWeek ?? defaultWeek;
  const dates = Array.from({ length: 7 }, (_, index) => shiftDay(week, index));
  const weeklyGames = useMemo(() => (games ?? []).filter((game) => isoDay(game.date) >= week && isoDay(game.date) < shiftDay(week, 7)).sort((a, b) => a.ts - b.ts || a.leagueId - b.leagueId), [games, week]);
  const filtered = weeklyGames.filter((game) => (league === 'all' || String(game.leagueId) === league) && (!onlyMine || !mine || mine(game)));
  const visible = filtered.filter((game) => selectedDay === 'all' || isoDay(game.date) === selectedDay);
  const groups = new Map<string, Game[]>();
  for (const game of visible.slice(0, limit)) {
    const day = isoDay(game.date);
    groups.set(day, [...(groups.get(day) ?? []), game]);
  }
  const changeWeek = (next: string) => { setSelectedWeek(next); setSelectedDay('all'); setLimit(40); };
  const tags = new Map(meta.leagues.map((ref) => [ref.id, leagueLabel(ref.short)]));
  return <section aria-label="Spielplan und Ergebnisse">
    <div className="score-toolbar">
      <div className="week-navigation">
        <button className="icon-button" onClick={() => changeWeek(shiftDay(week, -7))} aria-label="Vorherige Woche"><Icon name="chevron-left" size={18} /></button>
        <span className="week-label tabular">{formatDay(week).slice(3)} – {formatDay(dates[6]).slice(3)}</span>
        <button className="icon-button" onClick={() => changeWeek(shiftDay(week, 7))} aria-label="Nächste Woche"><Icon name="chevron-right" size={18} /></button>
      </div>
      <select className="field score-filter" aria-label="Spiele nach Liga filtern" value={league} onChange={(event) => { setLeague(event.target.value); setLimit(40); }}>
        <option value="all">Alle Ligen</option>{meta.leagues.map((ref) => <option key={ref.id} value={ref.id}>{ref.name}</option>)}
      </select>
    </div>
    <div className="date-strip" aria-label="Spieltag auswählen">
      <button className={`date-button ${selectedDay === 'all' ? 'is-selected' : ''}`} aria-pressed={selectedDay === 'all'} onClick={() => { setSelectedDay('all'); setLimit(40); }}><span>Woche</span><strong>Alle</strong><span className="date-dot" /></button>
      {dates.map((day, index) => <button key={day} className={`date-button ${selectedDay === day ? 'is-selected' : ''} ${day === today ? 'is-today' : ''}`} aria-pressed={selectedDay === day} aria-label={`${formatDay(day)}${day === today ? ', heute' : ''}`} onClick={() => { setSelectedDay(day); setLimit(40); }}><span>{['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][index]}</span><strong>{day.slice(8)}</strong><span className="date-dot" style={{ visibility: filtered.some((game) => isoDay(game.date) === day) ? 'visible' : 'hidden' }} /></button>)}
    </div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-(--color-ink-3)">
      <span aria-live="polite">{isPending ? 'Spielplan wird geladen …' : `${visible.length} ${visible.length === 1 ? 'Spiel' : 'Spiele'}${week === currentWeek ? ' diese Woche' : ''}`}</span>
      <div className="flex items-center gap-3">
        {week !== currentWeek && <button className="text-action" onClick={() => changeWeek(currentWeek)}>Heute</button>}
        {mine && <button className={`text-action ${onlyMine ? '' : 'text-(--color-ink-2)'}`} aria-pressed={onlyMine} onClick={() => { setOnlyMine(!onlyMine); setLimit(40); }}><Icon name="star" size={15} />{onlyMine ? 'Meine Spiele' : 'Nur Favoriten'}</button>}
      </div>
    </div>
    {isPending ? <Loading /> : error ? <ErrorBox error={error} /> : !visible.length ? <Empty><Icon name="calendar" size={28} className="mx-auto mb-3 text-(--color-ink-3)" /><p className="font-semibold text-(--color-ink)">Keine Spiele in dieser Auswahl</p><p className="mt-2">Wähle einen anderen Tag, eine andere Woche oder Liga.</p>{(selectedDay !== 'all' || league !== 'all' || onlyMine) && <button className="text-action mt-3" onClick={() => { setSelectedDay('all'); setLeague('all'); setOnlyMine(false); }}>Filter zurücksetzen<Icon name="arrow" size={16} /></button>}</Empty> : <>
      {[...groups].map(([day, list]) => <div key={day}><h2 className="day-heading">{relativeDay(day)}<span>{filtered.filter((game) => isoDay(game.date) === day).length} Spiele</span></h2><GameList games={list} showDate={false} leagueTag={(game) => tags.get(game.leagueId) ?? ''} /></div>)}
      {visible.length > limit && <button className="button-secondary mt-4 w-full" onClick={() => setLimit((value) => value + 40)}>Weitere {Math.min(40, visible.length - limit)} Spiele anzeigen<Icon name="chevron-right" size={15} /></button>}
      <MatchdayHighlights games={visible} />
    </>}
  </section>;
}

function FavoritesSetup({ meta, onDone }: { meta: Meta; onDone: () => void }) {
  const favorites = useFavorites();
  const selectedTeams = useFavoriteTeamIds();
  const favoriteLeagues = useFavoriteLeagues();
  const [kind, setKind] = useState<'teams' | 'leagues'>('teams');
  const [query, setQuery] = useState('');
  const [league, setLeague] = useState('all');
  const matches = matcher(query);
  const teams = (meta.teams ?? []).filter((team) => (!matches || matches(team.name)) && (league === 'all' || String(team.leagueId) === league)).sort((a, b) => Number(selectedTeams.has(b.id)) - Number(selectedTeams.has(a.id)) || a.name.localeCompare(b.name, 'de'));
  const leagues = meta.leagues.filter((ref) => !matches || matches(`${ref.name} ${ref.short}`));
  return <section className="favorite-editor" aria-labelledby="favorites-heading">
    <div className="section-heading"><h2 id="favorites-heading">Deine Favoriten</h2><button className="icon-button" onClick={onDone} aria-label="Favoritenauswahl schließen"><Icon name="close" size={17} /></button></div>
    <p className="mb-4 text-xs leading-relaxed text-(--color-ink-2)">Teams und Ligen auswählen. Deine Auswahl wird auf diesem Gerät gespeichert.</p>
    <Chips options={[{ id: 'teams', label: `Teams (${favorites.length})` }, { id: 'leagues', label: `Ligen (${favoriteLeagues.length})` }]} value={kind} onChange={setKind} />
    <div className="flex flex-wrap gap-2"><div className="search-field min-w-40 flex-1"><Icon name="search" size={17} /><input className="field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind === 'teams' ? 'Team suchen' : 'Liga suchen'} aria-label={kind === 'teams' ? 'Favoritenteam suchen' : 'Favoritenliga suchen'} /></div>{kind === 'teams' && <select className="field min-w-40 flex-1" value={league} aria-label="Teams nach Liga filtern" onChange={(event) => setLeague(event.target.value)}><option value="all">Alle Ligen</option>{meta.leagues.map((ref) => <option key={ref.id} value={ref.id}>{ref.name}</option>)}</select>}</div>
    <div className="favorite-results">{kind === 'teams' ? teams.slice(0, 40).map((team) => <button className="favorite-option" key={team.id} aria-pressed={selectedTeams.has(team.id)} onClick={() => toggleFavorite(team.name, meta.leagues.find((ref) => ref.id === team.leagueId)?.short ?? '')}><TeamLogo teamId={team.id} name={team.name} size={25} /><span className="min-w-0 flex-1"><span className="block font-medium">{team.name}</span><span className="mt-0.5 block text-[10px] text-(--color-ink-3)">{meta.leagues.find((ref) => ref.id === team.leagueId)?.name}</span></span><span className="favorite-check">{selectedTeams.has(team.id) && <Icon name="check" size={14} />}</span></button>) : leagues.map((ref) => <button className="favorite-option" key={ref.id} aria-pressed={favoriteLeagues.includes(ref.short)} onClick={() => toggleFavoriteLeague(ref.short)}><Icon name="leagues" size={20} /><span>{ref.name}</span><span className="favorite-check">{favoriteLeagues.includes(ref.short) && <Icon name="check" size={14} />}</span></button>)}
      {(kind === 'teams' ? teams.length : leagues.length) === 0 && <p className="py-6 text-center text-xs text-(--color-ink-2)">Keine Treffer für diese Auswahl.</p>}
    </div>
    {kind === 'teams' && teams.length > 40 && <p className="mt-3 text-xs text-(--color-ink-3)">{teams.length} Teams gefunden. Grenze die Auswahl mit Suche oder Liga ein.</p>}
    <div className="mt-4 flex justify-end"><button className="button-primary" onClick={onDone}><Icon name="check" size={15} />Fertig</button></div>
  </section>;
}

function ImportBanner({ onImported }: { onImported: () => void }) {
  const [params, setParams] = useSearchParams();
  const teams = params.getAll('team');
  const leagues = params.getAll('liga');
  if (!teams.length && !leagues.length) return null;
  return <div className="card mb-5 flex flex-wrap items-center gap-3 p-4 text-sm"><span className="min-w-0 flex-1">{teams.length} Teams und {leagues.length} Ligen aus dem Link als Favoriten übernehmen? Deine bisherige Auswahl wird ersetzt.</span><button className="button-secondary" onClick={() => setParams({}, { replace: true })}>Verwerfen</button><button className="button-primary" onClick={() => { setFavorites(teams, leagues); setParams({}, { replace: true }); onImported(); }}>Übernehmen</button></div>;
}
function ShareButton({ teams, leagues }: { teams: string[]; leagues: string[] }) {
  const [message, setMessage] = useState('Favoriten übertragen');
  return <button className="text-action" onClick={async () => {
    const url = shareLink(teams, leagues);
    try {
      if (navigator.share) await navigator.share({ title: 'Meine Handball-Favoriten', url });
      else { await navigator.clipboard.writeText(url); setMessage('Link kopiert'); }
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setMessage('Teilen gerade nicht möglich'); }
  }}><Icon name="share" size={15} />{message}</button>;
}

export function HomePage() {
  const { data: meta, isPending, error } = useMeta();
  const favorites = useFavorites();
  const favoriteLeagues = useFavoriteLeagues();
  const favoriteIds = useFavoriteTeamIds();
  const live = useLiveGames().filter((game) => game.status === 'live').length;
  const [editing, setEditing] = useState(false);
  const myLeagues = useMemo(() => (meta?.leagues ?? []).filter((league) => favoriteLeagues.includes(league.short)), [meta, favoriteLeagues]);
  const mine = useMemo(() => {
    if (!favoriteIds.size && !myLeagues.length) return null;
    const ids = new Set(myLeagues.map((league) => league.id));
    return (game: Game) => ids.has(game.leagueId) || favoriteIds.has(game.homeId ?? -1) || favoriteIds.has(game.guestId ?? -1);
  }, [favoriteIds, myLeagues]);
  if (isPending) return <Loading />;
  if (!meta) return <ErrorBox error={error} />;
  if (!meta.leagues.length) return <Empty>Der Spielplan für diese Saison wird vorbereitet. Wähle oben eine andere Saison.</Empty>;
  const myTeams = (meta.teams ?? []).filter((team) => favoriteIds.has(team.id));
  const featuredLeagues = [...myLeagues, ...meta.leagues.filter((league) => !favoriteLeagues.includes(league.short))].slice(0, 5);
  return <div>
    <div className="page-heading"><div><p className="page-eyebrow">Baden-Württemberg · {meta.leagues.length} Ligen</p><h1 className="page-title">Dein Spieltag.</h1><p className="page-subtitle">Ergebnisse, Spielpläne und alles, was auf dem Feld passiert.</p></div><button className="button-secondary" onClick={() => setEditing(!editing)} aria-expanded={editing} aria-label="Favoriten bearbeiten"><Icon name="settings" size={17} /><span className="button-label">Favoriten</span></button></div>
    <ImportBanner onImported={() => setEditing(false)} />
    {editing && <FavoritesSetup meta={meta} onDone={() => setEditing(false)} />}
    {live > 0 && <Link to="/live" className="live-banner"><LiveBadge /><span>{live} {live === 1 ? 'Spiel läuft' : 'Spiele laufen'} gerade</span><Icon name="arrow" size={19} /></Link>}
    <div className="home-grid"><div className="min-w-0"><MatchCenter key={meta.season} meta={meta} mine={mine} /></div><aside className="home-sidebar" aria-label="Deine Teams und Ligen">
      <Section title="Deine Teams" action={mine ? <button className="text-action" onClick={() => { setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Bearbeiten</button> : undefined}>
        {myTeams.length ? <><div>{myTeams.slice(0, 6).map((team) => <Link key={team.id} to={`/team/${team.id}`} className="favorite-team"><TeamLogo teamId={team.id} name={team.name} size={30} /><span className="min-w-0 flex-1"><span className="favorite-team-name block">{team.name}</span><span className="mt-1 block text-[10px] text-(--color-ink-3)">{leagueLabel(meta.leagues.find((league) => league.id === team.leagueId)?.short ?? '')}</span></span><Icon name="chevron-right" size={15} className="text-(--color-ink-3)" /></Link>)}</div>{myTeams.length > 6 && <button className="text-action mt-2" onClick={() => setEditing(true)}>Alle {myTeams.length} Favoriten bearbeiten</button>}</> : <div className="favorite-prompt"><Icon name="star" size={22} className="mb-3 text-(--color-brand)" /><h3 className="text-sm font-semibold">Dein Verein. Direkt hier.</h3><p>Speichere deine Teams und finde ihre Spiele auf einen Blick.</p><button className="button-secondary" onClick={() => { setEditing(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Teams auswählen<Icon name="arrow" size={15} /></button></div>}
        {(favorites.length > 0 || favoriteLeagues.length > 0) && <div className="mt-2"><ShareButton teams={favorites} leagues={favoriteLeagues} /></div>}
      </Section>
      <Section title={myLeagues.length ? 'Deine Ligen & mehr' : 'Ligen entdecken'} action={<TextLink to="/ligen">Alle {meta.leagues.length}<Icon name="arrow" size={14} /></TextLink>}><LeagueDirectory leagues={featuredLeagues} teams={meta.teams ?? []} stars={false} /><Link to="/ligen" className="text-action mt-3">Alle Tabellen & Spielpläne<Icon name="arrow" size={15} /></Link></Section>
    </aside></div>
  </div>;
}
