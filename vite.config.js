import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'ledger-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const pathname = (req.url || '').split('?')[0];
          if (!pathname.startsWith('/api/')) return next();
          try {
            const { handle } = await import('./lib/server.js');
            await handle(req, res);
          } catch (err) {
            console.error(err);
            if (!res.writableEnded) {
              res.statusCode = 500;
              res.setHeader('content-type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'The desk could not be saved' }));
            }
          }
        });
      },
    },
  ],
  server: { host: true, port: 4179 },
  preview: { host: true, port: 4179 },
});
