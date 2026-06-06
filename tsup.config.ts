import { defineConfig } from 'tsup';

// Builds appkit as a consumable library. Four entry points map to the
// package's `exports` in package.json:
//
//   index           → client React kit (KitProvider, useAuth, components, ...)
//   server          → server helpers (entitlement store, Stripe matchers)
//   verify-purchase → Vercel route handler; apps re-export it from api/
//   stripe-webhook  → Vercel route handler; apps re-export it from api/
//
// React (and friends) are externalized — the consuming app brings its own.
export default defineConfig({
  entry: {
    index: 'src/kit/index.ts',
    server: 'api/_lib.ts',
    'verify-purchase': 'api/verify-purchase.ts',
    'stripe-webhook': 'api/stripe-webhook.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  tsconfig: 'tsconfig.lib.json',
  // Everything in dependencies/peerDependencies is external by default; these
  // are belt-and-suspenders for the React runtime and Vercel types.
  external: ['react', 'react-dom', 'react/jsx-runtime', '@vercel/node'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
