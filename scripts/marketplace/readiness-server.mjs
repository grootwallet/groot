import { timingSafeEqual } from 'node:crypto';

// This child is for fixture acceptance only. It must never become a live relay.
globalThis.fetch = async () => {
  process.send?.({ type: 'blocked-network' });
  throw new Error('Outbound fetch is disabled in marketplace fixture verification.');
};

const port = Number(process.env.GROOT_READINESS_PORT);
const nonce = process.env.GROOT_READINESS_NONCE ?? '';
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[a-f0-9]{48}$/.test(nonce)) {
  throw new Error('Invalid fixture-server configuration.');
}

const { createServer } = await import('vite');
const server = await createServer({
  mode: 'regtest',
  server: { host: '127.0.0.1', port, strictPort: true, open: false },
  plugins: [
    {
      name: 'groot-owned-marketplace-verification',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== '/__groot_readiness') return next();
          const supplied = request.headers['x-groot-readiness'];
          if (
            request.method !== 'GET' ||
            typeof supplied !== 'string' ||
            !/^[a-f0-9]{48}$/.test(supplied) ||
            !timingSafeEqual(Buffer.from(supplied), Buffer.from(nonce))
          ) {
            response.statusCode = 404;
            response.end();
            return;
          }
          response.statusCode = 204;
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Groot-Readiness', nonce);
          response.end();
        });
      }
    }
  ]
});
await server.listen();
process.send?.({ type: 'ready' });

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  process.exitCode = 0;
  process.disconnect?.();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
process.on('disconnect', close);
