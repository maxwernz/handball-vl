import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect } from 'react';
import { BASE, useIndex, useLiveGames, useSeasonId } from '../api.ts';
import { useSeason } from '../lib/season.tsx';
import { setGender, useGender, type GenderFilter } from '../lib/gender.ts';
import { AppStatus } from './AppStatus.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { ErrorBox, Loading } from './ui.tsx';

function SeasonSelect() {
  const { data: index } = useIndex();
  const seasonId = useSeasonId();
  const { setSeason } = useSeason();
  const navigate = useNavigate();
  if (!index) return null;
  if (index.seasons.length < 2) return <span className="season-label">{index.seasons[0]?.name}</span>;
  return (
    <select aria-label="Saison auswählen" value={seasonId} onChange={(e) => {
      const id = Number(e.target.value);
      setSeason(id === index.currentSeason ? 'current' : id);
      navigate('/');
    }} className="season-select">
      {index.seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}
/** Men's or women's handball, or both (always shown separately). Applies to the whole app. */
function GenderSelect() {
  const gender = useGender();
  return (
    <select aria-label="Männer, Frauen oder beide getrennt anzeigen" value={gender} onChange={(e) => setGender(e.target.value as GenderFilter)} className="season-select gender-select">
      <option value="all">Beide</option>
      <option value="M">Männer</option>
      <option value="F">Frauen</option>
    </select>
  );
}
const navigation: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Spieltag', icon: 'calendar', end: true },
  { to: '/live', label: 'Live', icon: 'live' },
  { to: '/ligen', label: 'Ligen', icon: 'leagues' },
  { to: '/statistik', label: 'Statistik', icon: 'stats' },
  { to: '/suche', label: 'Suche', icon: 'search' },
];
export function Layout() {
  const { data: index, error: indexError, isPending: indexPending } = useIndex();
  const live = useLiveGames().filter((g) => g.status === 'live').length;
  const location = useLocation();
  const stale = index !== undefined && Date.now() - Date.parse(index.updatedAt) > 36 * 3600_000;
  const updated = index && Number.isFinite(Date.parse(index.updatedAt))
    ? new Date(index.updatedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  const active = (to: string, isActive: boolean) => isActive || (to === '/ligen' && location.pathname.startsWith('/liga/'));
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Zum Inhalt springen</a>
      <header className="app-header">
        <div className="header-inner">
          <NavLink to="/" className="brand" aria-label="Handball BW – Startseite">
            <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M8 8v16m16-16v16M8 16h16M12 8h8m-8 16h8" stroke="currentColor" strokeWidth="3" strokeLinecap="square"/><circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="2"/></svg></span>
            <span>HANDBALL<span className="brand-region">BW</span></span>
          </NavLink>
          <nav className="desktop-nav" aria-label="Hauptnavigation">
            {navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `desktop-nav-item ${active(item.to, isActive) ? 'is-active' : ''}`}>
              {item.label}{item.to === '/live' && live > 0 && <span className="nav-live-count">{live}</span>}
            </NavLink>)}
          </nav>
          <div className="header-season"><GenderSelect /><span className="season-caption">SAISON</span><SeasonSelect /></div>
        </div>
      </header>
      <main id="main-content" className="page-shell" tabIndex={-1}>
        <AppStatus />
        {stale && <div className="status-notice" role="status">Letzter Datenstand: {updated ?? 'unbekannt'} Uhr. Neue Ergebnisse werden geladen, sobald sie verfügbar sind.</div>}
        {!index && indexPending ? <Loading /> : !index && indexError ? <ErrorBox error={indexError} /> : <Outlet />}
      </main>
      <footer className="app-footer">
        <span className="footer-brand">HANDBALL BW</span>
        <span>Ergebnisse & Spielberichte: handball4all / BWHV · Logos: handball.net</span>
        {updated && <span>Datenstand {updated} Uhr · Live-Ergebnisse werden automatisch aktualisiert</span>}
        <a href={`${BASE}analyse/`} className="underline">Statistik-Werkbank: Tabellen, Diagramme, SQL</a>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile Hauptnavigation">
        {navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `mobile-nav-item ${active(item.to, isActive) ? 'is-active' : ''}`}>
          <span className="mobile-nav-icon"><Icon name={item.icon} size={22} />{item.to === '/live' && live > 0 && <span className="mobile-live-dot" />}</span>
          <span>{item.label}</span>
        </NavLink>)}
      </nav>
    </div>
  );
}
