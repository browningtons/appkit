// URL-based activation parsing.
//
// Stripe redirects and Payment Links hand the app its unlock state through
// the URL hash/search. This module is the single, pure place that turns that
// raw string into a decision. Keeping it pure (no `window`) makes it unit
// testable and keeps useAuth's mount effect thin.
//
// Recognized tokens (in either the hash or the query string):
//   pro=1                 → instant unlock (Stripe Payment Link success_url)
//   session_id=cs_...     → verified unlock via /api/verify-purchase
//   admin                 → flip admin on

export interface Activation {
  /** `#pro=1` was present — caller unlocks immediately. */
  pro: boolean;
  /** A `cs_`-prefixed Checkout Session id to verify, or null. */
  sessionId: string | null;
  /** `#admin` was present. */
  admin: boolean;
}

/**
 * Parse the combined `location.hash + location.search` string into an
 * activation decision. Accepts the raw concatenation (leading `#`/`?` and
 * mixed `#`/`?`/`&` separators are all tolerated).
 */
export function parseActivation(hashAndSearch: string): Activation {
  const tokens = hashAndSearch
    .replace(/^[#?]/, '')
    .split(/[#?&]/)
    .filter(Boolean);

  const sessionToken = tokens.find((t) => t.startsWith('session_id='));
  const rawSessionId = sessionToken
    ? sessionToken.slice('session_id='.length)
    : '';

  return {
    pro: tokens.includes('pro=1'),
    // Only trust well-formed Checkout Session ids; anything else is noise.
    sessionId: rawSessionId.startsWith('cs_') ? rawSessionId : null,
    admin: tokens.includes('admin'),
  };
}
