// A tiny signal for "a localStorage write was refused this page load" — a
// full quota, or a browser blocking site data in private mode. Sticky for
// the page's life: a later write that fits (a full quota still takes a
// shorter value) doesn't bring back what an earlier refusal lost, so once
// this flips it stays flipped until the next load. Same gap as
// our-family-lizard's `localSaveStatus.ts` (pack/revenue-rail #170);
// appkit had no signal of this kind at all before R15.

let refused = false;
const listeners = new Set<() => void>();

export function localSaveRefused(): boolean {
  return refused;
}

export function markLocalSaveRefused(): void {
  if (refused) return;
  refused = true;
  listeners.forEach((listener) => listener());
}

export function subscribeLocalSaveRefused(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tests only: a fresh page. */
export function __resetLocalSaveStatusForTests(): void {
  refused = false;
}
