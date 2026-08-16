import { useState, useEffect, useRef, useCallback } from 'react';
import { load, save, remove } from '../persistence';
import { useKitConfig } from '../use-kit-config';
import { trackProPurchase, trackRestoreAttempt } from '../analytics';
import { parseActivation } from '../activation';
import { reVerifyPlan, applyReVerifyResponse, type ReVerifyAction } from './proReverify';

const JUST_PURCHASED_KEY = 'just_purchased';
// The email a successful restore was proved with — the only handle a
// restored device holds for the boot re-verify below (checkout leaves a
// `cs_...` session id; restore leaves nothing else). Stored so a later refund
// can revoke this device the same way the buyer originally unlocked it.
const RESTORE_EMAIL_KEY = 'pro_restore_email';
// Timestamp of the last *answered* re-verify. Seeds and throttles the boot
// re-verify so a returning buyer is re-checked at most once per 24h.
const LAST_VERIFIED_KEY = 'pro_last_verified_at';

/**
 * Entitlement + admin state for the consuming app.
 *
 * - `isPro` is the boolean to gate UI on. It's `true` when the user has
 *   actually purchased OR when an admin is currently viewing as admin.
 * - `requirePro(action, source)` runs the action if Pro, else opens the
 *   upgrade modal with attribution. Use this everywhere — never check
 *   `isPro` inline before calling a premium action.
 *
 * URL activation paths (handled once on mount):
 *   #pro=1                   → instant unlock (used by Stripe Payment Link)
 *   #session_id=cs_...       → verified unlock via /api/verify-purchase
 *   #admin                   → flips admin on
 *
 * Refund revocation: a boot re-verify (throttled to once per 24h) re-checks a
 * verified unlock — by session id, or by the restore email — against
 * `/api/verify-purchase`, and revokes Pro when the backend affirmatively
 * reports it is no longer entitled (a refund). It fails OPEN on any 429/5xx or
 * network error, so a flaky backend never strips Pro from a paying buyer.
 * Policy lives in `proReverify.ts`. (A handle-less `#pro=1` unlock has nothing
 * to re-check and stays unlocked — use a `session_id` success_url or server
 * mode for refund-revocable entitlement.)
 *
 * Hidden admin: tap the logo `logoTapsToToggle` times within `tapWindowMs`.
 */
export function useAuth() {
  const config = useKitConfig();
  const sessionStorageKey = `${config.app.storagePrefix}${JUST_PURCHASED_KEY}`;

  const [isAdmin, setIsAdmin] = useState(() => load('admin', false));
  const [viewAs, setViewAs] = useState<'admin' | 'user'>('admin');
  const [isProReal, setIsProReal] = useState(() => load('pro', false));
  const [upgradeSource, setUpgradeSource] = useState<string | null>(null);

  const openUpgrade = useCallback((source: string) => setUpgradeSource(source), []);
  const closeUpgrade = useCallback(() => setUpgradeSource(null), []);

  // Survives a refresh, clears on tab close. Used to show a celebration
  // banner once after a successful Stripe redirect.
  const [justPurchased, setJustPurchased] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(sessionStorageKey) === '1';
  });

  const logoTapCount = useRef(0);
  const logoTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const markJustPurchased = useCallback(() => {
    setJustPurchased(true);
    try {
      window.sessionStorage.setItem(sessionStorageKey, '1');
    } catch {
      /* private mode */
    }
  }, [sessionStorageKey]);

  const dismissJustPurchased = useCallback(() => {
    setJustPurchased(false);
    try {
      window.sessionStorage.removeItem(sessionStorageKey);
    } catch {
      /* private mode */
    }
  }, [sessionStorageKey]);

  // Effective Pro: an admin viewing-as-admin is always Pro. An admin
  // viewing-as-user falls back to the real flag, so admins can preview the
  // free experience by toggling.
  const isPro = isAdmin && viewAs === 'admin' ? true : isProReal;

  // One-time URL activation on mount.
  useEffect(() => {
    const { pro, sessionId, admin } = parseActivation(
      `${window.location.hash}${window.location.search}`,
    );

    if (pro) {
      setIsProReal(true); // eslint-disable-line react-hooks/set-state-in-effect
      save('pro', true);
      markJustPurchased();
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (sessionId) {
      fetch(`/api/verify-purchase?session_id=${encodeURIComponent(sessionId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { verified?: boolean } | null) => {
          if (data?.verified) {
            setIsProReal(true);
            save('pro', true);
            save('stripe_session_id', sessionId);
            // Seed the throttle clock from this verify so the boot re-verify
            // effect won't immediately re-check on the buyer's next visit — it
            // fires 24h after this initial confirmation.
            save(LAST_VERIFIED_KEY, Date.now());
            markJustPurchased();
            trackProPurchase();
          }
        })
        .catch(() => {
          /* network — swallow; restore flow covers the gap */
        });
    }
    if (admin) {
      setIsAdmin(true);
      save('admin', true);
      window.history.replaceState(null, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    save('pro', isProReal);
  }, [isProReal]);
  useEffect(() => {
    save('admin', isAdmin);
  }, [isAdmin]);

  // Boot re-verify against the backend — catches refunds (or any revocation)
  // that happened since this device last opened the app. Without it, a Pro
  // unlock cached in localStorage is permanent on the device by every route
  // and a refund never revokes. Decision policy lives in `proReverify.ts`;
  // this effect is the I/O wrapper around it. Throttled to once per 24h, and
  // it FAILS OPEN on any non-2xx (429 rate-limit, 5xx) or network error — a
  // flaky backend must never strip Pro from a paying buyer.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const plan = reVerifyPlan({
      isProReal,
      sessionId: load<string>('stripe_session_id', ''),
      restoreEmail: load<string>(RESTORE_EMAIL_KEY, ''),
      lastCheck: load<number>(LAST_VERIFIED_KEY, 0),
      now: Date.now(),
    });
    if (plan.kind === 'skip') return;

    const settle = (action: ReVerifyAction) => {
      // fail open: leave Pro and the throttle untouched so we retry next mount.
      if (action.kind === 'fail_open') return;
      save(LAST_VERIFIED_KEY, Date.now());
      if (action.kind === 'revoke') {
        setIsProReal(false);
        save('pro', false);
        remove('stripe_session_id');
        remove(RESTORE_EMAIL_KEY);
      }
    };

    // Both paths hit /api/verify-purchase and return { verified: boolean };
    // read through the same wrapper so 429/5xx collapse to null → fail open.
    const request =
      plan.kind === 'session'
        ? fetch(`/api/verify-purchase?session_id=${encodeURIComponent(plan.sessionId)}`)
        : fetch('/api/verify-purchase', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: plan.email }),
          });

    request
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { verified?: boolean } | null) => settle(applyReVerifyResponse(data)))
      .catch(() => {
        /* fail open: leave Pro intact and the throttle untouched */
      });
    // Mount-only. Admin viewAs toggling shouldn't trigger backend calls, and a
    // re-verify completing in this same effect doesn't need to re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Secret logo tap → toggle admin.
  const handleLogoTap = useCallback(() => {
    const { logoTapsToToggle, tapWindowMs } = config.admin;
    logoTapCount.current += 1;
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    if (logoTapCount.current >= logoTapsToToggle) {
      logoTapCount.current = 0;
      const next = !isAdmin;
      setIsAdmin(next);
      save('admin', next);
    } else {
      logoTapTimer.current = setTimeout(() => {
        logoTapCount.current = 0;
      }, tapWindowMs);
    }
  }, [isAdmin, config.admin]);

  const requirePro = useCallback(
    (action: () => void, source = 'pro_gate') => {
      if (isPro) {
        action();
      } else {
        setUpgradeSource(source);
      }
    },
    [isPro],
  );

  const handleRestore = useCallback(async () => {
    const email = prompt('Enter the email address you used at checkout:');
    if (!email || !email.trim().includes('@')) return;
    try {
      const resp = await fetch('/api/verify-purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await resp.json()) as { verified?: boolean };
      if (data.verified) {
        setIsProReal(true);
        save('pro', true);
        // Keep the email as the handle so the boot re-verify can revoke this
        // device if the purchase is later refunded, and seed the throttle so
        // the next boot doesn't immediately re-POST.
        save(RESTORE_EMAIL_KEY, email.trim());
        save(LAST_VERIFIED_KEY, Date.now());
        setUpgradeSource(null);
        trackRestoreAttempt(true);
        alert('Pro unlocked. Welcome back.');
      } else {
        trackRestoreAttempt(false);
        alert(
          "We couldn't find a paid purchase for that email. Double-check the address on your Stripe receipt, or reply to the receipt email for help.",
        );
      }
    } catch {
      trackRestoreAttempt(false);
      alert('Something went wrong verifying your purchase. Try again in a moment.');
    }
  }, []);

  return {
    isAdmin,
    setIsAdmin,
    viewAs,
    setViewAs,
    isPro,
    isProReal,
    setIsProReal,
    upgradeSource,
    openUpgrade,
    closeUpgrade,
    justPurchased,
    dismissJustPurchased,
    handleLogoTap,
    requirePro,
    handleRestore,
  };
}
