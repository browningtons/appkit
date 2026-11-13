// @vitest-environment jsdom
//
// AdminBar is how the app's owner previews the free tier without a second
// device. The first block pins the bar on its own: it shows the tier the
// page is currently gating on and reports the owner's choices. The second
// wires it to useAuth the way App.tsx does and proves the toggle really
// moves the gate, and that signing out of admin sticks across a reload.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { KitProvider } from '../context';
import type { KitConfig } from '../config';
import { useAuth } from '../auth/useAuth';
import AdminBar from './AdminBar';

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

// AdminBar and a premium panel, wired exactly as App.tsx wires them.
function AppShell() {
  const auth = useAuth();
  return (
    <div>
      {auth.isAdmin && (
        <AdminBar
          isPro={auth.isPro}
          viewAs={auth.viewAs}
          setViewAs={auth.setViewAs}
          setIsAdmin={auth.setIsAdmin}
        />
      )}
      <section data-testid="premium">{auth.isPro ? 'premium content' : 'locked'}</section>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;

function button(name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === name || b.title === name,
  );
}

function adminBarShown(): boolean {
  return button('Sign out of admin') !== undefined;
}

function premiumPanel(): string | null | undefined {
  return container.querySelector('[data-testid="premium"]')?.textContent;
}

async function click(name: string) {
  await act(async () => {
    button(name)!.click();
  });
}

async function render(ui: ReactNode) {
  await act(async () => {
    root.render(<KitProvider config={TEST_CONFIG}>{ui}</KitProvider>);
  });
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

describe('AdminBar on its own', () => {
  function props(overrides: Partial<Parameters<typeof AdminBar>[0]> = {}) {
    return {
      isPro: true,
      viewAs: 'admin' as const,
      setViewAs: vi.fn(),
      setIsAdmin: vi.fn(),
      ...overrides,
    };
  }

  it('shows the tier the page is gating on', async () => {
    await render(<AdminBar {...props({ isPro: true })} />);
    expect(container.textContent).toContain('PRO ACTIVE');
    expect(container.textContent).not.toContain('FREE TIER');

    await render(<AdminBar {...props({ isPro: false, viewAs: 'user' })} />);
    expect(container.textContent).toContain('FREE TIER');
    expect(container.textContent).not.toContain('PRO ACTIVE');
  });

  it('reports which view the owner picks, without leaving admin mode', async () => {
    const p = props();
    await render(<AdminBar {...p} />);

    await click('Free User');
    expect(p.setViewAs).toHaveBeenLastCalledWith('user');

    await click('Admin');
    expect(p.setViewAs).toHaveBeenLastCalledWith('admin');
    expect(p.setIsAdmin).not.toHaveBeenCalled();
  });

  it('signing out leaves admin mode, resets the view, and remembers the choice', async () => {
    localStorage.setItem('test_admin', 'true');
    const p = props({ viewAs: 'user' });
    await render(<AdminBar {...p} />);

    await click('Sign out of admin');

    expect(p.setIsAdmin).toHaveBeenCalledWith(false);
    // Reset so the next admin session starts viewing as admin, not stuck on
    // the free-user preview.
    expect(p.setViewAs).toHaveBeenCalledWith('admin');
    expect(localStorage.getItem('test_admin')).toBe('false');
  });
});

describe('AdminBar wired to useAuth', () => {
  it('lets an admin who never bought preview the free tier and switch back', async () => {
    localStorage.setItem('test_admin', 'true');
    await render(<AppShell />);
    expect(adminBarShown()).toBe(true);
    expect(container.textContent).toContain('PRO ACTIVE');
    expect(premiumPanel()).toBe('premium content');

    await click('Free User');
    expect(container.textContent).toContain('FREE TIER');
    expect(premiumPanel()).toBe('locked');

    await click('Admin');
    expect(container.textContent).toContain('PRO ACTIVE');
    expect(premiumPanel()).toBe('premium content');
  });

  it('still shows a paying admin as Pro while previewing as a user', async () => {
    localStorage.setItem('test_admin', 'true');
    localStorage.setItem('test_pro', 'true');
    // Keep the boot re-verify quiet; this test is about the view toggle.
    localStorage.setItem('test_pro_last_verified_at', JSON.stringify(Date.now()));
    await render(<AppShell />);

    await click('Free User');

    expect(container.textContent).toContain('PRO ACTIVE');
    expect(premiumPanel()).toBe('premium content');
  });

  it('signing out hides the bar, re-locks the panel, and stays signed out after a reload', async () => {
    localStorage.setItem('test_admin', 'true');
    await render(<AppShell />);

    await click('Sign out of admin');
    expect(adminBarShown()).toBe(false);
    expect(premiumPanel()).toBe('locked');

    act(() => root.unmount());
    root = createRoot(container);
    await render(<AppShell />);

    expect(adminBarShown()).toBe(false);
    expect(premiumPanel()).toBe('locked');
  });
});
