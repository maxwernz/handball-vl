import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { BASE, useGames, useIndex, useMeta, useSeasonId } from '../api.ts';
import { useFavoriteLeagues } from '../lib/favorites.ts';
import { leagueLabel } from '../lib/format.ts';
import { useSeason } from '../lib/season.tsx';
import { storage } from '../lib/storage.ts';
import { LiveBadge } from './ui.tsx';

function useLiveCount() {
  // Rounded to 5 minutes so the query key (and cache entry) stays stable between renders.
  const now = Math.floor(Date.now() / 300_000) * 300_000;
  const from = new Date(now - 4 * 3600_000).toISOString();
  const to = new Date(now + 3600_000).toISOString();
  const { data } = useGames(from, to);
  return data?.filter((g) => g.status === 'live').length ?? 0;
}

function SeasonSelect() {
  const { data: index } = useIndex();
  const seasonId = useSeasonId();
  const { setSeason } = useSeason();
  const navigate = useNavigate();
  if (!index || index.seasons.length < 2) return null;
  return (
    <select
      aria-label="Saison"
      value={seasonId}
      onChange={(e) => {
        const id = Number(e.target.value);
        setSeason(id === index.currentSeason ? 'current' : id);
        // Team and league ids differ per season, so start over from the home page.
        navigate('/');
      }}
      className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-sm text-white outline-none"
    >
      {index.seasons.map((s) => (
        <option key={s.id} value={s.id} className="text-black">
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function Layout() {
  const { data: meta } = useMeta();
  const { data: index } = useIndex();
  const live = useLiveCount();
  const location = useLocation();
  const favoriteLeagues = useFavoriteLeagues();
  // Favorite leagues first; the sort is stable, so the rest keep their order.
  const leagues = [...(meta?.leagues ?? [])].sort((a, b) => Number(favoriteLeagues.includes(b.short)) - Number(favoriteLeagues.includes(a.short)));
  const lastLeague = storage.get('lastLeague');
  const leagueHref = `/liga/${lastLeague && leagues.some((l) => String(l.id) === lastLeague) ? lastLeague : (leagues[0]?.id ?? '')}`;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const navItem = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${isActive ? 'bg-white text-(--color-header)' : 'text-white/80 hover:bg-white/10 hover:text-white'}`;

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-8">
      <header className="sticky top-0 z-30 bg-(--color-header) pt-[env(safe-area-inset-top)] text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <img src={`${BASE}favicon.svg`} alt="" className="h-7 w-7 rounded-md" />
            <span>Handball VL</span>
          </NavLink>
          {live > 0 && (
            <NavLink to="/" aria-label={`${live} Spiele live`}>
              <LiveBadge />
            </NavLink>
          )}
          <nav className="ml-4 hidden gap-1 md:flex">
            <NavLink to="/" end className={navItem}>
              Start
            </NavLink>
            <NavLink to="/statistik" className={navItem}>
              Statistik
            </NavLink>
          </nav>
          <div className="ml-auto">
            <SeasonSelect />
          </div>
        </div>
        {leagues.length > 0 && (
          <nav className="scrollbar-none mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
            {leagues.map((l) => (
              <NavLink key={l.id} to={`/liga/${l.id}`} className={navItem} title={l.name}>
                {favoriteLeagues.includes(l.short) && <span aria-label="Favorit">★ </span>}
                {leagueLabel(l.short)}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {meta?.incomplete && (
        <div className="bg-(--color-draw)/15 px-4 py-2 text-center text-sm">
          Für diese Saison sind noch nicht alle Spielberichte geladen – Statistiken sind unvollständig.
        </div>
      )}

      <main className="mx-auto max-w-6xl overflow-x-clip px-4 pt-4">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-6xl px-4 pt-6 pb-4 text-center text-xs text-(--color-ink-3)">
        Daten: handball4all / BWHV
        {index && (
          <>
            {' · '}Stand {new Date(index.updatedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} Uhr, Live-Stände direkt von h4a
          </>
        )}
        {' · '}Logos: handball.net
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-(--color-line) bg-(--color-surface)/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-3">
          {[
            { to: '/', label: 'Start', icon: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', end: true },
            { to: leagueHref, label: 'Tabellen', icon: 'M4 5h16M4 10h16M4 15h16M4 20h10', active: location.pathname.startsWith('/liga') },
            { to: '/statistik', label: 'Statistik', icon: 'M5 20V11M12 20V4M19 20v-6' },
          ].map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive || item.active ? 'text-(--color-brand)' : 'text-(--color-ink-3)'}`
              }
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
