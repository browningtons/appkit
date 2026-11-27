// Internal: the React context objects themselves. Split out from context.tsx
// so the provider component file stays component-only (fast-refresh
// requires that), and the hook files have somewhere to import them from
// without re-exporting from context.tsx.

import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { KitConfig } from './config';

export const KitContext = createContext<KitConfig | null>(null);

export interface EntitlementContextValue {
  isProReal: boolean;
  setIsProReal: Dispatch<SetStateAction<boolean>>;
}

export const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function useEntitlementContext(): EntitlementContextValue {
  const ctx = useContext(EntitlementContext);
  if (!ctx) {
    throw new Error('useEntitlement must be used inside <KitProvider>');
  }
  return ctx;
}
