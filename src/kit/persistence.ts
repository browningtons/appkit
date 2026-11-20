// Tiny localStorage helpers, namespaced by the app's storagePrefix from
// kit.config. Keep this surface minimal — the kit shouldn't grow into a
// general persistence library; consuming apps own their own storage shape.

import { getKitConfig } from './config';
import { markLocalSaveRefused } from './local-save-status';

function key(name: string): string {
  return `${getKitConfig().app.storagePrefix}${name}`;
}

export function load<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(name: string, val: unknown): void {
  try {
    localStorage.setItem(key(name), JSON.stringify(val));
  } catch {
    // Private mode / quota — drop silently, same as OFL, but flag it (R15)
    // so a UI that cares (e.g. PurchaseConfirmation) can warn instead of
    // claiming an unlock that nothing durably saved.
    markLocalSaveRefused();
  }
}

export function remove(name: string): void {
  try {
    localStorage.removeItem(key(name));
  } catch {
    /* ignore */
  }
}
