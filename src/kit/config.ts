// KitConfig is the contract every consuming app fills in via kit.config.ts.
//
// We also keep a module-level singleton so non-React utilities (analytics,
// persistence helpers called from event handlers, etc.) can read the
// prefix without taking it as an argument every call. The singleton is
// populated by <KitProvider> at app startup.

export interface KitConfig {
  app: {
    name: string;
    shortName: string;
    /** localStorage / sessionStorage key prefix. */
    storagePrefix: string;
  };
  stripe: {
    publishableKey: string;
    buyButtonId: string;
    /** Hosted Payment Link, used as a fallback. */
    paymentUrl: string;
    /** Documentation only — server reads from env. */
    priceIdHint: string;
    productIdHint: string;
  };
  upgrade: {
    headerTitle: string;
    headerSubtitle: string;
    price: string;
    priceCaption: string;
    features: string[];
    trustLine: string;
  };
  analytics: {
    eventPrefix: string;
  };
  admin: {
    logoTapsToToggle: number;
    tapWindowMs: number;
  };
}

let CONFIG: KitConfig | null = null;

// kit.config.example.ts's shipped `upgrade.trustLine`, across both variants
// it has carried (pre- and post-R7): the original finished-looking prose,
// and the REPLACE_ME placeholder R7 replaced it with. trustLine is a
// binding public refund/billing promise — shipping it un-reviewed means the
// app makes that promise on the adopter's behalf. Matching both keeps this
// check correct regardless of which lands on main first. Brittle against
// paraphrase, but brittle-but-loud beats silent-but-flexible for a legal
// string (see appkit R7/A7).
const PLACEHOLDER_TRUST_LINES = new Set([
  'Secure payment via Stripe. 30-day refund, no questions asked. No account. No recurring charges.',
  'REPLACE_ME: your refund and billing promise (e.g. "Secure payment via Stripe. 30-day refund. No account. No recurring charges.")',
]);

/** Called by KitProvider on mount. Safe to call repeatedly. */
export function setKitConfig(config: KitConfig): void {
  if (PLACEHOLDER_TRUST_LINES.has(config.upgrade.trustLine)) {
    console.error(
      'appkit: upgrade.trustLine is still the placeholder from ' +
        'kit.config.example.ts. This is a binding public refund/billing ' +
        'promise shown to buyers — replace it with a promise your app can ' +
        'actually keep before shipping.',
    );
  }
  CONFIG = config;
}

/** Throws if called before KitProvider has mounted. */
export function getKitConfig(): KitConfig {
  if (!CONFIG) {
    throw new Error(
      'appkit: getKitConfig() called before KitProvider mounted. ' +
        'Wrap your app in <KitProvider config={KIT_CONFIG}> in main.tsx.',
    );
  }
  return CONFIG;
}
