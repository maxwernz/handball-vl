import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { Layout } from './components/Layout.tsx';
import { SeasonProvider } from './lib/season.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LeaguePage } from './pages/LeaguePage.tsx';
import { TeamPage } from './pages/TeamPage.tsx';
import { GamePage } from './pages/GamePage.tsx';
import { PlayerPage } from './pages/PlayerPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { LivePage } from './pages/LivePage.tsx';
import { SearchPage } from './pages/SearchPage.tsx';
import { ComparePage } from './pages/ComparePage.tsx';
import { NotFound } from './pages/NotFound.tsx';
import { LeaguesPage } from './pages/LeaguesPage.tsx';
import { RouteError } from './components/RouteError.tsx';
import { DataRequestError } from './lib/requests.ts';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: (attempt, error) => attempt < 1 && !(error instanceof DataRequestError && [404, 429].includes(error.status)), refetchOnWindowFocus: true } },
});
// These unobserved entries bridge the final whistle to the next published result.
queryClient.setQueryDefaults(['tickerResult'], { gcTime: 24 * 3600_000, staleTime: Infinity });

const router = createBrowserRouter(
  [
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/ligen', element: <LeaguesPage /> },
      { path: '/liga/:id', element: <LeaguePage /> },
      { path: '/team/:id', element: <TeamPage /> },
      { path: '/spiel/:id', element: <GamePage /> },
      { path: '/spieler/:key', element: <PlayerPage /> },
      { path: '/statistik', element: <StatsPage /> },
      { path: '/live', element: <LivePage /> },
      { path: '/suche', element: <SearchPage /> },
      { path: '/vergleich', element: <ComparePage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  ],
  // Served from a sub path on GitHub Pages (e.g. /handball-vl/).
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SeasonProvider>
        <RouterProvider router={router} />
      </SeasonProvider>
    </QueryClientProvider>
  </StrictMode>,
);
