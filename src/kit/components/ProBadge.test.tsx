// @vitest-environment jsdom
//
// ProBadge is the header marker a buyer sees once the gate clears. It takes
// no config, so these render it bare: it must read "PRO" in both sizes, and
// the `small` variant (used inline next to section headings) must actually
// draw smaller than the default.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ProBadge from './ProBadge';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function iconWidth(): number {
  return Number(container.querySelector('svg')?.getAttribute('width'));
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ProBadge', () => {
  it('reads PRO with its icon', async () => {
    await act(async () => {
      root.render(<ProBadge />);
    });

    expect(container.textContent).toBe('PRO');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('draws the small variant smaller than the default, still reading PRO', async () => {
    await act(async () => {
      root.render(<ProBadge />);
    });
    const defaultWidth = iconWidth();

    await act(async () => {
      root.render(<ProBadge small />);
    });

    expect(container.textContent).toBe('PRO');
    expect(iconWidth()).toBeGreaterThan(0);
    expect(iconWidth()).toBeLessThan(defaultWidth);
  });
});
