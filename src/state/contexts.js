import { createContext } from 'react';

// Context objects live here so providers (.jsx) and hooks (.js) can be split cleanly.
export const ThemeContext = createContext(null);
export const YearContext = createContext(null);
// Toasts use two contexts: stable actions (push/dismiss) and the changing list (only <Toaster/> reads it),
// so components that call useToast() don't re-render whenever a toast appears.
export const ToastActionsContext = createContext(null);
export const ToastListContext = createContext(null);
