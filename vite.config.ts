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
  // files a test imported, and UI components sit at "not measured" instead of
  // 0%. That is what let them slip past the A17 floor.
  //
  // Floor, not a pin: a few points under the all-files baseline measured
  // 2026-11-03 (58.99% statements, 57% branches, 56.31% functions, 58.9%
  // lines). The 2026-11-01 numbers (~63/63/70/64) only counted imported files.
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
      exclude: ['**/*.d.ts'],
      thresholds: {
        statements: 55,
        branches: 54,
        functions: 52,
        lines: 55,
      },
    },
  },
});
