// Second page: the statistics workbench at /analyse/. It loads the SQLite database
// (analysis/publish.ts) and runs every query in the browser.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'analysis/web',
  base: `${process.env.BASE_PATH ?? '/'}analyse/`,
  build: { outDir: '../../dist/analyse', emptyOutDir: true, chunkSizeWarningLimit: 5000 },
  plugins: [
    react(),
    {
      // Dev server: serve the local database (npm run analyse:update) the same way Pages does.
      name: 'local-database',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url?.split('?')[0].endsWith('/handball.db.gz')) return next();
          const file = path.resolve('analysis/handball.db');
          if (!fs.existsSync(file)) { res.statusCode = 404; res.end('Erst npm run analyse:update ausführen.'); return; }
          res.setHeader('Content-Type', 'application/octet-stream');
          res.end(zlib.gzipSync(fs.readFileSync(file), { level: 1 }));
        });
      },
    },
  ],
});
