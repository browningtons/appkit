import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { KitConfig } from './config';
import { setKitConfig } from './config';
import { EntitlementContext, KitContext } from './context-internal';
import { load, save } from './persistence';

interface KitProviderProps {
  config: KitConfig;
  children: ReactNode;
}

/**
 * Wraps the app so kit hooks/components can read config and share live
 * entitlement state. Also pushes the config into the module-level singleton
 * for non-React utilities (analytics, persistence) that can't easily call hooks.
 */
export function KitProvider({ config, children }: KitProviderProps) {
  // Set the singleton synchronously on first render so utilities that fire
  // during render (e.g. captureUtmParams in App body, initial `load` below)
  // see the config.
  setKitConfig(config);

  const [isProReal, setIsProReal] = useState(() => load('pro', false));
  const lastSavedPro = useRef(isProReal);

  // Re-sync after every render in case config object changes (rare, but
  // useful for hot-reload during development).
  useEffect(() => {
    setKitConfig(config);
  }, [config]);

  // Persist entitlement transitions only when the flag actually changes, so
  // mount never clobbers a redirect-time write before the re-render commits.
  useEffect(() => {
    if (lastSavedPro.current === isProReal) return;
    lastSavedPro.current = isProReal;
    save('pro', isProReal);
  }, [isProReal]);

  const entitlement = useMemo(
    () => ({ isProReal, setIsProReal }),
    [isProReal],
  );

  return (
    <KitContext.Provider value={config}>
      <EntitlementContext.Provider value={entitlement}>
        {children}
      </EntitlementContext.Provider>
    </KitContext.Provider>
  );
}
