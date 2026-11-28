// Read-only view of entitlement state for components that don't need the
// full useAuth surface. Useful for deeply-nested children that just want
// to render a <ProBadge> or hide a row.
//
// In practice useAuth() is fine for almost everything; this exists so
// future entitlement modes (server-backed subscriptions) can be swapped
// in here without touching the consuming components.

import { useEntitlementContext } from '../context-internal';

export function useEntitlement(): { isPro: boolean } {
  // Reads the same live state KitProvider shares with useAuth, so grants
  // and revocations propagate in the same render without a localStorage lag.
  const { isProReal } = useEntitlementContext();
  return { isPro: isProReal };
}
