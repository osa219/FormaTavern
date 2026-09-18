import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

const lan =
  process.env.FORMATAVERN_NETWORK_MODE === 'lan' ||
  process.env.FORMATAVERN_NETWORK_MODE === 'custom';
const backendPort = Number(process.env.FORMATAVERN_PORT ?? 3000);

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  optimizeDeps: {
    include: [
      '@sinclair/typebox',
      '@sinclair/typebox/value',
      '@elysiajs/eden',
      'jsonrepair',
      'marked',
      'dompurify',
      'css-tree',
      'gpt-tokenizer'
    ]
  },
  server: {
    host: lan ? '0.0.0.0' : '127.0.0.1',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.ts.net'],
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] }, // serve ../packages/shared/src (symlink resolves outside frontend/)
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`, // IPv4 literal. NOT "localhost". See §4.3
        changeOrigin: true,
        xfwd: true,
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
      },
      '/assets': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
        xfwd: true
      }
    }
  }
});
