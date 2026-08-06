import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * Keep workspace packages external (load from package dist).
 * Bundling twinby-adapter broke locator profile paths (__dirname → out/main).
 * predev builds packages; full Electron restart picks up dist changes.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
      },
    },
    plugins: [
      react({
        // Fast Refresh preamble is flaky under Electron CSP/sandbox and can
        // leave #root empty with no UI. Prefer full reload in desktop dev.
        // @ts-expect-error plugin typings omit fastRefresh in this version
        fastRefresh: false,
      }),
    ],
  },
});
