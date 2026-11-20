// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setKitConfig, type KitConfig } from './config';
import { load, remove, save } from './persistence';
import { __resetLocalSaveStatusForTests, localSaveRefused } from './local-save-status';

const TEST_CONFIG: KitConfig = {
  app: { name: 'Test App', shortName: 'Test', storagePrefix: 'persistence_test_' },
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

beforeEach(() => {
  localStorage.clear();
  setKitConfig(TEST_CONFIG);
});

afterEach(() => {
  vi.restoreAllMocks();
  __resetLocalSaveStatusForTests();
});

describe('persistence', () => {
  it('round-trips a value through save/load', () => {
    save('thing', { a: 1 });

    expect(load('thing', null)).toEqual({ a: 1 });
  });

  it('falls back when nothing is stored', () => {
    expect(load('missing', 'fallback')).toBe('fallback');
  });

  it('removes a stored value', () => {
    save('thing', 1);
    remove('thing');

    expect(load('thing', null)).toBeNull();
  });

  it('does not mark the local-save signal refused on a normal write', () => {
    save('thing', 1);

    expect(localSaveRefused()).toBe(false);
  });

  // R15: a full quota (or a browser blocking site data in private mode)
  // throws out of `setItem`. `save()` already swallowed that silently —
  // this pins that it keeps doing so, but now also flags the shared
  // signal so a UI that cares (PurchaseConfirmation) can warn.
  it('marks the local-save signal refused when the write throws, without throwing itself', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(() => save('thing', 1)).not.toThrow();
    expect(localSaveRefused()).toBe(true);
  });
});
