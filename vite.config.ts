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
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Handball Verbandsliga BW',
        short_name: 'Handball VL',
        description: 'Tabellen, Ergebnisse, Spielberichte und Statistiken der Männer-Verbandsligen im BWHV',
        lang: 'de',
        theme_color: '#0b1426',
        background_color: '#0b1426',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/api\//],
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
