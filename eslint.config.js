import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // api/ writes to Vercel's logs only through api/_log.ts, which cuts every
    // Checkout Session id (a bearer credential) out of each line.
    // api/logging-guard.test.ts pins these rules. Every JS/TS extension
    // Vercel would execute, not just `.ts`, and `noInlineConfig` closes the
    // other escape: a hurried `// eslint-disable-next-line no-console`.
    files: ['api/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    ignores: ['api/**/*.test.ts'],
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-console': 'error',
      'no-restricted-properties': [
        'error',
        ...['stdout', 'stderr', 'emitWarning'].map((property) => ({
          object: 'process',
          property,
          message: 'Log through `log` in api/_log.ts: it cuts Checkout Session ids out.',
        })),
      ],
    },
  },
  {
    files: ['api/_log.ts'],
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-console': ['error', { allow: ['error', 'warn', 'info'] }],
    },
  },
]);
