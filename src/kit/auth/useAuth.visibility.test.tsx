// @vitest-environment jsdom
//
// Covers the visibilitychange re-verify effect in useAuth: a refund processed
// while the tab was backgrounded must be caught on refocus, without waiting
// for a full reload. Mirrors debt-snowball-ant's "useAuth visibility
// re-check" suite, adapted to appkit's session-id re-verify.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KitProvider } from '../context';
import type { KitConfig } from '../config';
import { useAuth } from './useAuth';

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

function EntitlementProbe() {
  const { isProReal } = useAuth();
  return <div data-testid="isProReal">{String(isProReal)}</div>;
}

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

function readIsProReal(): boolean {
  return container.querySelector('[data-testid="isProReal"]')?.textContent === 'true';
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  // A device that completed checkout: Pro is on and the session id handle
  // (saved by the activation effect on the redirect mount) is present.
  localStorage.setItem('test_pro', 'true');
  localStorage.setItem('test_stripe_session_id', JSON.stringify('cs_test_visibility'));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
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

describe('useAuth visibility re-check', () => {
  it('re-verifies on visibilitychange and revokes Pro when the purchase was refunded', async () => {
    await act(async () => {
      root.render(
        <KitProvider config={TEST_CONFIG}>
          <EntitlementProbe />
        </KitProvider>,
      );
    });
    expect(readIsProReal()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    // Simulate a refund landing while this tab was backgrounded: the
    // re-verify fired on refocus now reports verified: false.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ verified: false }),
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/verify-purchase?session_id=cs_test_visibility',
    );
    expect(readIsProReal()).toBe(false);
    // The persistence effect must have synced the revoke.
    expect(localStorage.getItem('test_pro')).toBe('false');
  });

  it('does not re-check while the tab is hidden', async () => {
    await act(async () => {
      root.render(
        <KitProvider config={TEST_CONFIG}>
          <EntitlementProbe />
        </KitProvider>,
      );
    });
    expect(readIsProReal()).toBe(true);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readIsProReal()).toBe(true);
  });

  it('fails open when the response shape is missing the verified field', async () => {
    await act(async () => {
      root.render(
        <KitProvider config={TEST_CONFIG}>
          <EntitlementProbe />
        </KitProvider>,
      );
    });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readIsProReal()).toBe(true);
  });
});
