import { describe, it, expect, vi, afterEach } from 'vitest';
import { setKitConfig, getKitConfig, type KitConfig } from './config';

const REPLACE_ME_TRUST_LINE =
  'REPLACE_ME: your refund and billing promise (e.g. "Secure payment via Stripe. 30-day refund. No account. No recurring charges.")';
const PRE_R7_TRUST_LINE =
  'Secure payment via Stripe. 30-day refund, no questions asked. No account. No recurring charges.';

function makeConfig(trustLine: string): KitConfig {
  return {
    app: { name: 'Test App', shortName: 'Test', storagePrefix: 'test_' },
    stripe: {
      publishableKey: 'pk_test_x',
      buyButtonId: 'buy_btn_x',
      paymentUrl: 'https://buy.stripe.com/test_x',
      priceIdHint: 'price_x',
      productIdHint: 'prod_x',
    },
    upgrade: {
      headerTitle: 'Unlock',
      headerSubtitle: 'Sub',
      price: '$29',
      priceCaption: 'One-time',
      features: ['a'],
      trustLine,
    },
    analytics: { eventPrefix: 'test_' },
    admin: { logoTapsToToggle: 5, tapWindowMs: 3000 },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setKitConfig', () => {
  it('logs an error when trustLine equals the REPLACE_ME placeholder', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setKitConfig(makeConfig(REPLACE_ME_TRUST_LINE));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('trustLine');
  });

  it('logs an error when trustLine equals the pre-R7 shipped prose', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setKitConfig(makeConfig(PRE_R7_TRUST_LINE));
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('stays silent once trustLine has been replaced', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setKitConfig(makeConfig('Secure payment via Stripe. 14-day refund.'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still sets the config even when the placeholder check fires', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = makeConfig(REPLACE_ME_TRUST_LINE);
    setKitConfig(config);
    expect(getKitConfig()).toBe(config);
  });
});
