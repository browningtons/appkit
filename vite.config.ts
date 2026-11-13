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
  // Vitest 4 removed `coverage.all` (and `coverage.extensions`). The v8
  // provider only adds untested files when `coverage.include` is set, and the
  // extensions have to be in that glob. Otherwise the report is just the
  // files a test imported, and shipped files sit at "not measured" instead of
  // 0%. That is what let them slip past the A17 floor.
  //
  // A floor: raise it when coverage grows, never lower it. First set
  // 2026-11-03 a few points under the all-files baseline then (58.99/57/
  // 56.31/58.9). Raised 2026-11-12, once the five kit components and
  // useEntitlement got tests, to the all-files numbers measured then
  // rounded down (80% statements, 76.33% branches, 81.41% functions,
  // 81.37% lines; up from 70/67.6/66.37/70.28).
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
      exclude: ['**/*.d.ts'],
      thresholds: {
        statements: 80,
        branches: 76,
        functions: 81,
        lines: 81,
      },
    },
  },
});
