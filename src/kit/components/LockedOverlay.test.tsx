// @vitest-environment jsdom
//
// LockedOverlay sits over a premium panel for free users. It must say what
// unlocking costs (from kit.config, not hardcoded), honor a per-panel label,
// and treat a click anywhere on it as "I want to upgrade". It is also the
// smallest kit component that reads config, so it carries the check that a
// kit component mounted outside <KitProvider> fails loudly with the fix in
// the message instead of rendering blank.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KitProvider } from '../context';
import type { KitConfig } from '../config';
import LockedOverlay from './LockedOverlay';

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
    price: '$4.99',
    priceCaption: 'One-Time Purchase',
    features: [],
    trustLine: 't',
  },
  analytics: { eventPrefix: 'test' },
  admin: { logoTapsToToggle: 5, tapWindowMs: 3000 },
};

let container: HTMLDivElement;
let root: Root;

function textNode(text: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>('span')].find(
    (el) => el.textContent === text,
  );
}

async function renderOverlay(props: { onUpgrade: () => void; label?: string }) {
  await act(async () => {
    root.render(
      <KitProvider config={TEST_CONFIG}>
        <LockedOverlay {...props} />
      </KitProvider>,
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('LockedOverlay', () => {
  it('invites the user to unlock and shows the configured price', async () => {
    await renderOverlay({ onUpgrade: () => {} });

    expect(textNode('Unlock with Pro')).toBeDefined();
    expect(textNode('$4.99 one-time purchase')).toBeDefined();
  });

  it('uses a per-panel label when one is given', async () => {
    await renderOverlay({ onUpgrade: () => {}, label: 'Unlock the dashboard' });

    expect(textNode('Unlock the dashboard')).toBeDefined();
    expect(textNode('Unlock with Pro')).toBeUndefined();
  });

  it('asks to upgrade when the user clicks anywhere on it', async () => {
    const onUpgrade = vi.fn();
    await renderOverlay({ onUpgrade });
    expect(onUpgrade).not.toHaveBeenCalled();

    await act(async () => {
      textNode('Unlock with Pro')!.click();
    });
    expect(onUpgrade).toHaveBeenCalledTimes(1);

    await act(async () => {
      textNode('$4.99 one-time purchase')!.click();
    });
    expect(onUpgrade).toHaveBeenCalledTimes(2);
  });

  it('fails loudly, naming the fix, when mounted outside KitProvider', async () => {
    // React reports the render error on the console as well as throwing it.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      act(async () => {
        root.render(<LockedOverlay onUpgrade={() => {}} />);
      }),
    ).rejects.toThrow('useKitConfig must be used inside <KitProvider>');
  });
});
