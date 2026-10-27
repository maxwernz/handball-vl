import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'web',
  // GitHub Pages serves project sites from /<repo>/; the deploy workflow sets this.
  base: process.env.BASE_PATH ?? '/',
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Let people finish reading a match before activating an app update.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Handball BW – Ergebnisse & Live',
        short_name: 'Handball BW',
        description: 'Handball in Baden-Württemberg: Spiele, Tabellen, Live-Ticker und Statistiken für Frauen und Männer.',
        lang: 'de',
        theme_color: '#111820',
        background_color: '#f5f6f8',
        display: 'standalone',
        id: '.',
        start_url: '.',
        scope: '.',
        categories: ['sports', 'news'],
        shortcuts: [
          { name: 'Live-Konferenz', short_name: 'Live', url: './live' },
          { name: 'Alle Ligen', short_name: 'Ligen', url: './ligen' },
          { name: 'Teams & Spieler suchen', short_name: 'Suche', url: './suche' },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only cache the app shell up front. Thousands of reports are cached on demand.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['api/**', 'analyse/**'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/api\//, /\/analyse(\/|$)/],
        runtimeCaching: [
          {
            // Data stays readable offline, but the network always wins when available.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/api/') && !url.pathname.includes('/api/logos/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 6, expiration: { maxEntries: 300, maxAgeSeconds: 14 * 86400 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/api/logos/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'logos', expiration: { maxEntries: 400, maxAgeSeconds: 30 * 86400 } },
          },
        ],
      },
    }),
  ],
});
