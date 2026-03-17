import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    assetsInclude: ['**/*.br'],
    plugins: [
      basicSsl(),
      react(),
      tailwindcss(),
      {
        name: 'unity-webgl-headers',
        enforce: 'pre',
        configureServer(server) {
          // Return a function so that the middleware is added *before* Vite's static serving middleware.
          return () => {
            server.middlewares.use((req, res, next) => {
              if (req.url && req.url.includes('.br')) {
                res.setHeader('Content-Encoding', 'br');
                if (req.url.includes('.wasm')) {
                  res.setHeader('Content-Type', 'application/wasm');
                } else if (req.url.includes('.js')) {
                  res.setHeader('Content-Type', 'application/javascript');
                } else if (req.url.includes('.data')) {
                  res.setHeader('Content-Type', 'application/octet-stream');
                }
              } else if (req.url && req.url.includes('.gz')) {
                res.setHeader('Content-Encoding', 'gzip');
                if (req.url.includes('.wasm')) {
                  res.setHeader('Content-Type', 'application/wasm');
                } else if (req.url.includes('.js')) {
                  res.setHeader('Content-Type', 'application/javascript');
                } else if (req.url.includes('.data')) {
                  res.setHeader('Content-Type', 'application/octet-stream');
                }
              }
              next();
            });
          };
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
