// Demo config used by the appkit demo app. Real apps cloning the kit
// should replace this with their own values (see kit.config.example.ts).

import type { KitConfig } from './src/kit';

export const KIT_CONFIG: KitConfig = {
  app: {
    name: 'appkit demo',
    shortName: 'appkit',
    storagePrefix: 'appkit_demo_',
  },

  stripe: {
    publishableKey: 'pk_test_DEMO',
    buyButtonId: 'buy_btn_DEMO',
    paymentUrl: 'https://buy.stripe.com/test_DEMO',
    priceIdHint: 'price_DEMO',
    productIdHint: 'prod_DEMO',
  },

  upgrade: {
    headerTitle: 'See the demo unlock flow',
    headerSubtitle: 'This is what your buyers will see.',
    price: '$29',
    priceCaption: 'One-time purchase',
    features: [
      'A premium feature',
      'Another premium feature',
      'A nice-to-have',
      'Export / share / etc.',
    ],
    trustLine:
      'Secure payment via Stripe. 30-day refund, no questions asked. No account. No recurring charges.',
  },

  analytics: {
    eventPrefix: 'appkit_demo_',
  },

  admin: {
    logoTapsToToggle: 5,
    tapWindowMs: 3000,
  },
};
