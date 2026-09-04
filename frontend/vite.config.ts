import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] }, // serve ../packages/shared/src (symlink resolves outside frontend/)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000', // IPv4 literal. NOT "localhost". See §4.3
        changeOrigin: true,
        ws: false,
        // http-proxy pipes chunked responses without buffering by default.
        // The hooks below are defensive: forbid compression negotiation and
        // pin no-cache/no-transform semantics on event streams.
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept-Encoding', 'identity');
          });
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const ct = proxyRes.headers['content-type'] ?? '';
            if (ct.startsWith('text/event-stream')) {
              res.setHeader('Cache-Control', 'no-cache, no-transform');
              res.setHeader('X-Accel-Buffering', 'no');
              res.flushHeaders?.();
            }
          });
        }
      }
    }
  }
});
