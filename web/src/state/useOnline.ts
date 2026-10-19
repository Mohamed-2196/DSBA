import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

const subscribe = (listener: () => void) => onlineManager.subscribe(listener);
const isOnline = () => onlineManager.isOnline();

/** False while the browser has no connection (as TanStack Query sees it, so it agrees with what queries do). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
