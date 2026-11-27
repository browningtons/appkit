// @vitest-environment jsdom
//
// useEntitlement is the read-only Pro check for deeply nested components
// (a ProBadge in a list row, a hidden menu item). It reads the live
// entitlement state KitProvider shares with useAuth, initialized from the
// purchase stored on this device. These pin that it is false for a device
// that never bought, true from a stored purchase, scoped to this app's
// storagePrefix (two kit apps on one origin must not unlock each other),
// closed when the stored value is unreadable, loud outside <KitProvider>,
// and in lockstep with useAuth on the exact render a grant or revoke lands.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KitProvider } from '../context';
import type { KitConfig } from '../config';
import { useAuth } from './useAuth';
import { useEntitlement } from './useEntitlement';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TEST_CONFIG: KitConfig = {
  app: { name: 'Test App', shortName: 'Test', storagePrefix: 'test_' },
  stripe: {
    publishableKey: 'pk_test',
    buyButtonId: 'buy_btn_test',
    paymentUrl: 'https://buy.stripe.com/test',
    priceIdHint: 'price_test',
    productIdHint: 'prod_test',
  },
  upgrade: {
    headerTitle: 't',
    headerSubtitle: 't',
    price: '$1',
    priceCaption: 'once',
    features: [],
    trustLine: 't',
  },
  analytics: { eventPrefix: 'test' },
  admin: { logoTapsToToggle: 5, tapWindowMs: 3000 },
};

function NestedBadge() {
  const { isPro } = useEntitlement();
  return <span data-testid="entitled">{isPro ? 'pro' : 'free'}</span>;
}

// The app root owns useAuth; the badge sits further down and only peeks.
function AppShell() {
  const { isPro } = useAuth();
  return (
    <main>
      <span data-testid="auth">{isPro ? 'pro' : 'free'}</span>
      <NestedBadge />
    </main>
  );
}

let container: HTMLDivElement;
let root: Root;

function badge(): string | null | undefined {
  return container.querySelector('[data-testid="entitled"]')?.textContent;
}

// What useAuth (the app root) and useEntitlement (nested) each report.
function bothViews() {
  return {
    auth: container.querySelector('[data-testid="auth"]')?.textContent,
    nested: badge(),
  };
}

async function render(ui: ReactNode) {
  await act(async () => {
    root.render(<KitProvider config={TEST_CONFIG}>{ui}</KitProvider>);
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
  window.history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useEntitlement', () => {
  it('reports free on a device that never bought', async () => {
    await render(<NestedBadge />);

    expect(badge()).toBe('free');
  });

  it('reports Pro from the purchase stored on this device', async () => {
    // Complete a checkout redirect, then come back on a later visit.
    window.history.replaceState(null, '', '/#pro=1');
    await render(<AppShell />);
    act(() => root.unmount());

    root = createRoot(container);
    await render(<NestedBadge />);

    expect(badge()).toBe('pro');
  });

  it("does not unlock from another kit app's purchase on the same origin", async () => {
    localStorage.setItem('other_app_pro', 'true');
    await render(<NestedBadge />);

    expect(badge()).toBe('free');
  });

  it('fails closed when the stored value is unreadable', async () => {
    localStorage.setItem('test_pro', '{not json');
    await render(<NestedBadge />);

    expect(badge()).toBe('free');
  });

  it('fails loudly, naming the fix, when called outside KitProvider', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      act(async () => {
        root.render(<NestedBadge />);
      }),
    ).rejects.toThrow('useEntitlement must be used inside <KitProvider>');
  });

  describe('stays in sync with useAuth on the same render', () => {
    it('agrees with useAuth in the render where a checkout redirect grants Pro', async () => {
      window.history.replaceState(null, '', '/#pro=1');
      await render(<AppShell />);

      expect(bothViews()).toEqual({ auth: 'pro', nested: 'pro' });
    });

    it('agrees with useAuth in the render where a refund revokes Pro', async () => {
      // A buyer whose checkout session is on this device and was re-checked
      // just now, so only the refocus re-verify below fires.
      localStorage.setItem('test_pro', 'true');
      localStorage.setItem('test_stripe_session_id', JSON.stringify('cs_test_refunded'));
      localStorage.setItem('test_pro_last_verified_at', JSON.stringify(Date.now()));
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ verified: false }),
      });
      vi.stubGlobal('fetch', fetchMock);
      await render(<AppShell />);

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(bothViews()).toEqual({ auth: 'free', nested: 'free' });
    });
  });
});
