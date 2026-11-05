// The runtime guard in `setKitConfig` (A7 follow-up) console.errors when an
// adopter's `upgrade.trustLine` still equals a shipped placeholder. The repo's
// own two tracked configs were the near-miss that guard did not catch:
// R7/A7 replaced the finished-looking refund promise in kit.config.example.ts
// but left the identical string in kit.config.ts (the demo `npm run dev`
// renders), where the guard only ever logged on a dev run nobody reads
// (fixed by hand in #29). This test holds both files to the placeholder set
// at CI time so the same near-miss fails the build instead.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_TRUST_LINES } from './config';

const ROOT = resolve(__dirname, '..', '..');
const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8');

const PRE_R7_PROSE =
  'Secure payment via Stripe. 30-day refund, no questions asked. No account. No recurring charges.';
const REPLACE_ME = 'REPLACE_ME: your refund and billing promise';

describe('shipped trustLine placeholders', () => {
  it('the guard set still names both historical placeholders', () => {
    expect([...PLACEHOLDER_TRUST_LINES].some((line) => line === PRE_R7_PROSE)).toBe(true);
    expect([...PLACEHOLDER_TRUST_LINES].some((line) => line.startsWith(REPLACE_ME))).toBe(true);
  });

  it('kit.config.ts (the demo the dev server renders) carries no placeholder', () => {
    const demo = read('kit.config.ts');
    for (const line of PLACEHOLDER_TRUST_LINES) {
      expect(demo, `kit.config.ts still ships: ${line}`).not.toContain(line);
    }
    // The demo must still say plainly that it is demo copy, not a promise.
    expect(demo).toMatch(/trustLine:\s*\n?\s*'Demo copy only/);
  });

  it('kit.config.example.ts ships the REPLACE_ME placeholder and never the finished prose', () => {
    const example = read('kit.config.example.ts');
    expect(example).toContain(REPLACE_ME);
    expect(example).not.toContain(PRE_R7_PROSE);
  });
});
