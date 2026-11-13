// @vitest-environment jsdom
//
// PurchaseConfirmation is the one clear "your payment worked" moment a buyer
// gets after the Stripe redirect. These pin what it says, that the dismiss
// control is the only thing that closes it, and (through useAuth, the way
// App.tsx wires it) that the banner survives a refresh but stays gone once
// the buyer dismisses it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KitProvider } from '../context';
import type { KitConfig } from '../config';
import { useAuth } from '../auth/useAuth';
import PurchaseConfirmation from './PurchaseConfirmation';

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

const BANNER_TEXT = 'Payment received — Test App Pro is unlocked.';

// The banner exactly as App.tsx mounts it.
function AppShell() {
  const auth = useAuth();
  return auth.justPurchased ? (
    <PurchaseConfirmation onDismiss={auth.dismissJustPurchased} />
  ) : null;
}

let container: HTMLDivElement;
let root: Root;

function dismissButton(): HTMLButtonElement | null {
  return container.querySelector('button[aria-label="Dismiss"]');
}

async function render(ui: ReactNode) {
  await act(async () => {
    root.render(<KitProvider config={TEST_CONFIG}>{ui}</KitProvider>);
  });
}

// A page reload: tear the tree down and mount a fresh one.
async function reload(ui: ReactNode) {
  act(() => root.unmount());
  root = createRoot(container);
  await render(ui);
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
});

describe('PurchaseConfirmation', () => {
  it('tells the buyer the payment landed and names the app that unlocked', async () => {
    await render(<PurchaseConfirmation onDismiss={() => {}} />);

    expect(container.textContent).toContain(BANNER_TEXT);
  });

  it('closes only through the dismiss control', async () => {
    const onDismiss = vi.fn();
    await render(<PurchaseConfirmation onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      dismissButton()!.click();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows after a checkout redirect, survives a refresh, and stays gone once dismissed', async () => {
    window.history.replaceState(null, '', '/#pro=1');
    await render(<AppShell />);
    expect(container.textContent).toContain(BANNER_TEXT);

    // A refresh before dismissing keeps the celebration up.
    await reload(<AppShell />);
    expect(container.textContent).toContain(BANNER_TEXT);

    await act(async () => {
      dismissButton()!.click();
    });
    expect(container.textContent).not.toContain(BANNER_TEXT);

    // And it does not come back on the next load.
    await reload(<AppShell />);
    expect(container.textContent).not.toContain(BANNER_TEXT);
  });
});
