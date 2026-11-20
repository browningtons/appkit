import { useSyncExternalStore } from 'react';
import { localSaveRefused, subscribeLocalSaveRefused } from './local-save-status';

export function useLocalSaveRefused(): boolean {
  return useSyncExternalStore(subscribeLocalSaveRefused, localSaveRefused);
}
