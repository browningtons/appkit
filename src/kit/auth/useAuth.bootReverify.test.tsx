// @vitest-environment jsdom
//
// Covers the boot re-verify effect in useAuth for a device holding BOTH Pro
// handles — a checkout session id and a restore email, usually two different
// purchases. Ported from our-family-lizard#144 (A-R1 item 1): the old
// session-preferring plan revoked Pro the moment the session's purchase was
// refunded, even while the email's purchase was still paid.

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

async function mount() {
  await act(async () => {
    root.render(
      <KitProvider config={TEST_CONFIG}>
        <EntitlementProbe />
      </KitProvider>,
    );
  });
  // Two fetches settle through Promise.all, then settle() runs: drain twice.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function respond(verified: boolean | null) {
  return verified === null
    ? Promise.resolve({ ok: false, json: async () => ({}) })
    : Promise.resolve({ ok: true, json: async () => ({ verified }) });
}

/** Route the GET (session) and POST (restore) calls to separate answers. */
function answerWith(session: boolean | null, restore: boolean | null) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === 'POST' ? respond(restore) : respond(session),
  );
}

beforeEach(() => {
  localStorage.clear();
  // A device that bought once (session id) and later restored a second
  // purchase by email. The throttle has never been seeded, so the boot
  // re-verify fires on mount.
  localStorage.setItem('test_pro', 'true');
  localStorage.setItem('test_stripe_session_id', JSON.stringify('cs_test_both'));
  localStorage.setItem('test_pro_restore_email', JSON.stringify('buyer@example.com'));
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

describe('useAuth boot re-verify with both handles', () => {
  it('checks the session id and the restore email together', async () => {
    answerWith(true, true);
    await mount();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/verify-purchase?session_id=cs_test_both');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/verify-purchase',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'buyer@example.com' }),
      }),
    );
    expect(readIsProReal()).toBe(true);
    expect(localStorage.getItem('test_pro_last_verified_at')).not.toBeNull();
  });

  it('keeps Pro when the session purchase was refunded but the restored one still verifies', async () => {
    // The regression: the old plan asked only the session id and revoked here.
    answerWith(false, true);
    await mount();

    expect(readIsProReal()).toBe(true);
    expect(localStorage.getItem('test_pro')).toBe('true');
    expect(localStorage.getItem('test_stripe_session_id')).toBe(JSON.stringify('cs_test_both'));
  });

  it('revokes only when neither purchase verifies', async () => {
    answerWith(false, false);
    await mount();

    expect(readIsProReal()).toBe(false);
    expect(localStorage.getItem('test_pro')).toBe('false');
    expect(localStorage.getItem('test_stripe_session_id')).toBeNull();
    expect(localStorage.getItem('test_pro_restore_email')).toBeNull();
  });

  it('fails open when one side revokes and the other is a 429/5xx', async () => {
    answerWith(false, null);
    await mount();

    expect(readIsProReal()).toBe(true);
    // Throttle untouched so the next mount asks again.
    expect(localStorage.getItem('test_pro_last_verified_at')).toBeNull();
  });

  it('fails open when the network throws', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    await mount();

    expect(readIsProReal()).toBe(true);
    expect(localStorage.getItem('test_pro_last_verified_at')).toBeNull();
  });

  it('drops a revoke when a newer unlock saved a different handle while the check was out', async () => {
    let resolveSession!: (value: unknown) => void;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? respond(false)
        : new Promise((resolve) => {
            resolveSession = resolve;
          }),
    );
    await mount();
    expect(readIsProReal()).toBe(true);

    // A checkout in another tab (or this one) verified a new purchase and
    // saved its session id before this re-verify's answer landed.
    localStorage.setItem('test_stripe_session_id', JSON.stringify('cs_test_newer'));
    await act(async () => {
      resolveSession({ ok: true, json: async () => ({ verified: false }) });
    });
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // Both sides said "refunded", but about handles the device no longer
    // holds as a set: the newer unlock stands and nothing is written.
    expect(readIsProReal()).toBe(true);
    expect(localStorage.getItem('test_pro')).toBe('true');
    expect(localStorage.getItem('test_stripe_session_id')).toBe(JSON.stringify('cs_test_newer'));
    expect(localStorage.getItem('test_pro_last_verified_at')).toBeNull();
  });
});
