import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { Layout } from './components/Layout.tsx';
import { SeasonProvider } from './lib/season.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LeaguePage } from './pages/LeaguePage.tsx';
import { TeamPage } from './pages/TeamPage.tsx';
import { GamePage } from './pages/GamePage.tsx';
import { PlayerPage } from './pages/PlayerPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { NotFound } from './pages/NotFound.tsx';

registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } },
});

const router = createBrowserRouter(
  [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/liga/:id', element: <LeaguePage /> },
      { path: '/team/:id', element: <TeamPage /> },
      { path: '/spiel/:id', element: <GamePage /> },
      { path: '/spieler/:key', element: <PlayerPage /> },
      { path: '/statistik', element: <StatsPage /> },
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
