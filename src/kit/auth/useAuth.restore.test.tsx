// @vitest-environment jsdom
//
// Covers handleRestore's client-side email gate. Before this test, an
// invalid-looking email (no "@", or a cancelled/blank prompt) silently did
// nothing — the only branch in this function with zero user feedback, while
// every other outcome (success, no match, network error) shows an alert().
// A first-time buyer who fat-fingered their receipt email had no way to know
// why "Restore" appeared to do nothing.

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

function RestoreProbe() {
  const { isProReal, handleRestore } = useAuth();
  return (
    <div>
      <div data-testid="isProReal">{String(isProReal)}</div>
      <button onClick={() => void handleRestore()}>restore</button>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();
const promptMock = vi.fn();
const alertMock = vi.fn();

function readIsProReal(): boolean {
  return container.querySelector('[data-testid="isProReal"]')?.textContent === 'true';
}

function clickRestore() {
  const button = container.querySelector('button') as HTMLButtonElement;
  button.click();
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  promptMock.mockReset();
  alertMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('prompt', promptMock);
  vi.stubGlobal('alert', alertMock);
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

describe('useAuth handleRestore email gate', () => {
  it('warns and does not call the backend when the entered text has no "@"', async () => {
    promptMock.mockReturnValue('not-an-email');
    await act(async () => {
      root.render(
        <KitProvider config={TEST_CONFIG}>
          <RestoreProbe />
        </KitProvider>,
      );
    });

    await act(async () => {
      clickRestore();
    });
    await flushMicrotasks();

    expect(alertMock).toHaveBeenCalledWith(
      expect.stringContaining("doesn't look like an email address"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readIsProReal()).toBe(false);
  });

  it('does nothing and does not alert when the prompt is cancelled', async () => {
    promptMock.mockReturnValue(null);
    await act(async () => {
      root.render(
        <KitProvider config={TEST_CONFIG}>
          <RestoreProbe />
        </KitProvider>,
      );
    });

    await act(async () => {
      clickRestore();
    });
    await flushMicrotasks();

    expect(alertMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing and does not alert when the prompt is submitted blank', async () => {
    promptMock.mockReturnValue('   ');
    await act(async () => {
      root.render(
        <KitProvider config={TEST_CONFIG}>
          <RestoreProbe />
        </KitProvider>,
      );
    });

    await act(async () => {
      clickRestore();
    });
    await flushMicrotasks();

    expect(alertMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still restores on a valid, trimmed email', async () => {
    promptMock.mockReturnValue('  buyer@example.com  ');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ verified: true }),
    });
    await act(async () => {
      root.render(
        <KitProvider config={TEST_CONFIG}>
          <RestoreProbe />
        </KitProvider>,
      );
    });

    await act(async () => {
      clickRestore();
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/verify-purchase',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'buyer@example.com' }),
      }),
    );
    expect(readIsProReal()).toBe(true);
    expect(alertMock).toHaveBeenCalledWith('Pro unlocked. Welcome back.');
  });
});
