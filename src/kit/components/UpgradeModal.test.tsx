// @vitest-environment jsdom
//
// UpgradeModal is the paywall itself: every adopter's revenue goes through
// it. These pin that it shows the adopter's own copy, counts one
// "upgrade_shown" per opening source for the funnel, hands close and restore
// back to the app, and picks the right checkout path: the embedded Stripe
// Buy Button only when a real id is configured, otherwise the Payment Link,
// carrying the visitor's UTMs so the sale is attributed to its channel.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KitProvider } from '../context';
import type { KitConfig } from '../config';
import { captureUtmParams } from '../analytics';
import UpgradeModal from './UpgradeModal';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@vercel/analytics', () => ({ track }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeConfig(buyButtonId: string): KitConfig {
  return {
    app: { name: 'Test App', shortName: 'Test', storagePrefix: 'test_' },
    stripe: {
      publishableKey: 'pk_test_123',
      buyButtonId,
      paymentUrl: 'https://buy.stripe.com/test_abc',
      priceIdHint: 'price_test',
      productIdHint: 'prod_test',
    },
    upgrade: {
      headerTitle: 'Unlock everything',
      headerSubtitle: 'One payment, yours forever.',
      price: '$4.99',
      priceCaption: 'One-time purchase',
      features: ['PDF export', 'Unlimited boards'],
      trustLine: 'Refunds within 14 days, by reply to your receipt.',
    },
    analytics: { eventPrefix: 'test_' },
    admin: { logoTapsToToggle: 5, tapWindowMs: 3000 },
  };
}

const CONFIGURED = makeConfig('buy_btn_1Pabc');

let container: HTMLDivElement;
let root: Root;

function button(name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
  );
}

function buyNowLink(): HTMLAnchorElement | undefined {
  return [...container.querySelectorAll('a')].find((a) =>
    a.textContent?.startsWith('Buy now'),
  );
}

function upgradeShownCalls() {
  return track.mock.calls.filter(([name]) => name === 'test_upgrade_shown');
}

async function render(ui: ReactNode, config: KitConfig = CONFIGURED) {
  await act(async () => {
    root.render(<KitProvider config={config}>{ui}</KitProvider>);
  });
}

beforeEach(() => {
  track.mockReset();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('UpgradeModal', () => {
  it("shows the adopter's own pitch, price, features and refund promise", async () => {
    await render(<UpgradeModal source="pdf_button" onClose={() => {}} onRestore={() => {}} />);

    const text = container.textContent;
    expect(container.querySelector('h2')?.textContent).toBe('Unlock everything');
    expect(text).toContain('One payment, yours forever.');
    expect(text).toContain('$4.99');
    expect(text).toContain('One-time purchase');
    expect(text).toContain('PDF export');
    expect(text).toContain('Unlimited boards');
    expect(text).toContain('Refunds within 14 days, by reply to your receipt.');
  });

  it('counts one upgrade_shown per opening source, not per re-render', async () => {
    await render(<UpgradeModal source="pdf_button" onClose={() => {}} onRestore={() => {}} />);
    expect(upgradeShownCalls()).toEqual([
      ['test_upgrade_shown', { source: 'pdf_button' }],
    ]);

    // The parent re-rendering with fresh callbacks is not a new impression.
    await render(<UpgradeModal source="pdf_button" onClose={() => {}} onRestore={() => {}} />);
    expect(upgradeShownCalls()).toHaveLength(1);

    // Re-opened from a different gate is.
    await render(<UpgradeModal source="share_button" onClose={() => {}} onRestore={() => {}} />);
    expect(upgradeShownCalls()).toHaveLength(2);
    expect(upgradeShownCalls()[1]).toEqual(['test_upgrade_shown', { source: 'share_button' }]);
  });

  it('hands close and restore back to the app, each on its own control', async () => {
    const onClose = vi.fn();
    const onRestore = vi.fn();
    await render(<UpgradeModal source="pdf_button" onClose={onClose} onRestore={onRestore} />);

    await act(async () => {
      button('Close upgrade modal')!.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();

    await act(async () => {
      button('Already purchased? Restore')!.click();
    });
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('embeds the Stripe Buy Button when a real button id is configured', async () => {
    await render(<UpgradeModal source="pdf_button" onClose={() => {}} onRestore={() => {}} />);

    const buyButton = container.querySelector('stripe-buy-button');
    expect(buyButton).not.toBeNull();
    expect(buyButton!.getAttribute('buy-button-id')).toBe('buy_btn_1Pabc');
    expect(buyButton!.getAttribute('publishable-key')).toBe('pk_test_123');
    expect(buyNowLink()).toBeUndefined();
  });

  it.each([
    ['left empty', ''],
    ['still the example placeholder', 'buy_btn_REPLACE_ME'],
    ["still the demo app's id", 'buy_btn_DEMO'],
  ])('falls back to the Payment Link when the button id is %s', async (_label, buyButtonId) => {
    await render(
      <UpgradeModal source="pdf_button" onClose={() => {}} onRestore={() => {}} />,
      makeConfig(buyButtonId),
    );

    expect(container.querySelector('stripe-buy-button')).toBeNull();
    const link = buyNowLink();
    expect(link?.textContent).toBe('Buy now — $4.99');
    expect(link?.getAttribute('href')).toBe('https://buy.stripe.com/test_abc');
  });

  it("carries the visitor's UTMs to Stripe checkout and to the upgrade_shown event", async () => {
    window.history.replaceState(
      null,
      '',
      '/?utm_source=reddit&utm_medium=social&utm_campaign=launch',
    );
    // Capture the landing UTMs the way App.tsx does: in the body, under the
    // provider.
    function Landing() {
      captureUtmParams();
      return <UpgradeModal source="pdf_button" onClose={() => {}} onRestore={() => {}} />;
    }
    await render(<Landing />, makeConfig(''));

    expect(buyNowLink()?.getAttribute('href')).toBe(
      'https://buy.stripe.com/test_abc?client_reference_id=reddit_social_launch',
    );
    expect(upgradeShownCalls()).toEqual([
      [
        'test_upgrade_shown',
        {
          utm_source: 'reddit',
          utm_medium: 'social',
          utm_campaign: 'launch',
          source: 'pdf_button',
        },
      ],
    ]);
  });
});
