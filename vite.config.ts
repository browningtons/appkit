import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  // The demo site builds here so it never collides with the published library
  // in dist/ (the package's `exports` point at dist/).
  build: { outDir: 'demo-dist' },
  // Floor, not a pin: a few points under the measured baseline (~63/63/70/64
  // on 2026-11-01) so routine edits don't flake the gate, but a real coverage
  // regression still fails CI instead of landing silently.
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 65,
        lines: 60,
      },
    },
  },
});
