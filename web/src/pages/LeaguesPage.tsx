import { useMemo, useState } from 'react';
import { useMeta } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { LeagueDirectory, LeagueShortcuts, leagueCategory } from '../components/LeagueDirectory.tsx';
import { Chips, Empty, ErrorBox, Loading } from '../components/ui.tsx';
import { useFavoriteLeagues } from '../lib/favorites.ts';
import { matcher } from '../lib/search.ts';

type Filter = 'all' | 'Männer' | 'Frauen' | 'favorites';
export function LeaguesPage() {
  const { data: meta, isPending, error } = useMeta();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const favorites = useFavoriteLeagues();
  const leagues = useMemo(() => {
    const matches = matcher(query);
    return (meta?.leagues ?? []).filter((league) => (!matches || matches(`${league.name} ${league.short}`)) && (filter === 'all' || filter === 'favorites' && favorites.includes(league.short) || filter === leagueCategory(league)));
  }, [meta, query, filter, favorites]);
  if (isPending) return <Loading />;
  if (!meta) return <ErrorBox error={error} />;
  return <div className="directory-layout">
    <div className="page-heading"><div><p className="page-eyebrow">Baden-Württemberg</p><h1 className="page-title">Alle Ligen</h1><p className="page-subtitle">{meta.leagues.length} Wettbewerbe. Tabellen, Spielpläne und die Zahlen zum Spiel.</p></div><Icon name="leagues" size={37} className="hidden text-(--color-ink-3) sm:block" /></div>
    <LeagueShortcuts leagues={meta.leagues} all={false} />
    <div className="directory-filters"><div className="search-field"><Icon name="search" size={18} /><input type="search" className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Liga oder Staffel suchen" aria-label="Liga oder Staffel suchen" /></div></div>
    <Chips options={[{ id: 'all', label: 'Alle' }, { id: 'Männer', label: 'Männer' }, { id: 'Frauen', label: 'Frauen' }, { id: 'favorites', label: 'Meine Ligen' }]} value={filter} onChange={setFilter} />
    {leagues.length === 0 ? <Empty>{filter === 'favorites' && !query ? 'Markiere eine Liga mit dem Stern, damit du sie hier schnell wiederfindest.' : 'Keine passende Liga gefunden. Versuche einen anderen Suchbegriff oder Filter.'}</Empty> : <div className="directory-groups">{['Männer', 'Frauen', 'Weitere'].map((category) => {
      const group = leagues.filter((league) => leagueCategory(league) === category);
      return group.length > 0 && <section key={category}><h2 className="directory-group-title">{category}<span className="ml-2 text-xs font-normal text-(--color-ink-3)">{group.length}</span></h2><LeagueDirectory leagues={group} teams={meta.teams ?? []} /></section>;
    })}</div>}
    <p className="mt-6 text-xs leading-relaxed text-(--color-ink-3)">Mit dem Stern speicherst du deine Ligen auf diesem Gerät.</p>
  </div>;
}
