import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cspPlugin } from './build/csp.ts';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  plugins: [react(), cspPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
  },
  build: {
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
  preview: { port: 4173, strictPort: true },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
