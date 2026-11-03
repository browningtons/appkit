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
  // Floor, not a pin: a few points under the measured baseline. `include`
  // makes the report cover every shipped file, not just ones a test happens
  // to import — without it, src/kit/components/* and useEntitlement.ts had
  // zero tests and were invisible to the old import-only report, which read
  // 63/63/70/64 instead of the true 59/57/56/59 (found 2026-11-03, the A17
  // "left open" gap).
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['api/**/*.ts', 'src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', 'src/main.tsx'],
      thresholds: {
        statements: 56,
        branches: 54,
        functions: 51,
        lines: 55,
      },
    },
  },
});
