import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetLocalSaveStatusForTests,
  localSaveRefused,
  markLocalSaveRefused,
  subscribeLocalSaveRefused,
} from './local-save-status';

afterEach(() => {
  __resetLocalSaveStatusForTests();
});

describe('local-save-status', () => {
  it('starts un-refused', () => {
    expect(localSaveRefused()).toBe(false);
  });

  it('flips to refused and notifies subscribers', () => {
    const listener = vi.fn();
    subscribeLocalSaveRefused(listener);

    markLocalSaveRefused();

    expect(localSaveRefused()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stays refused and does not re-notify once already refused (sticky for the page)', () => {
    markLocalSaveRefused();
    const listener = vi.fn();
    subscribeLocalSaveRefused(listener);

    markLocalSaveRefused();

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying a listener once it unsubscribes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLocalSaveRefused(listener);
    unsubscribe();

    markLocalSaveRefused();

    expect(listener).not.toHaveBeenCalled();
  });
});
