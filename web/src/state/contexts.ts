import { createContext, type ReactNode } from 'react';
import type { CohortYear } from './cohort';

export type Theme = 'light' | 'dark';

export interface ThemeValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export interface YearValue {
  /** The cohort whose content is shown: 1|2|3, or null until one is chosen (onboarding shows). */
  year: CohortYear | null;
  /**
   * Browse another cohort. A guest's choice is remembered in this browser; a signed-in student's cohort
   * stays the default, and a different year lasts for this visit. null = back to the default.
   */
  setYear: (year: CohortYear | null) => void;
  /** year ?? 1, for views that need a concrete year before onboarding. */
  activeYear: CohortYear;
}

export type ToastTone = 'info' | 'success' | 'alert';

export interface ToastInput {
  title: ReactNode;
  body?: ReactNode;
  /** default 'info' */
  tone?: ToastTone;
  /** ms; 0 = stays until dismissed (default 5000) */
  duration?: number;
  action?: { label: string; onClick?: () => void };
}

export interface Toast extends ToastInput {
  id: string;
  tone: ToastTone;
  duration: number;
}

export interface ToastActions {
  /** Show a toast; returns its id. */
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

export interface ToastList {
  toasts: Toast[];
  dismiss: (id: string) => void;
}

// Context objects live here so providers (.tsx) and hooks (.ts) can be split cleanly.
export const ThemeContext = createContext<ThemeValue | null>(null);
export const YearContext = createContext<YearValue | null>(null);
/** Internal: how the auth provider tells YearProvider the signed-in person's cohort (null: guest or none). */
export const AccountYearContext = createContext<((year: CohortYear | null) => void) | null>(null);
// Toasts use two contexts: stable actions (push/dismiss) and the changing list (only <Toaster/> reads it),
// so components that call useToast() don't re-render whenever a toast appears.
export const ToastActionsContext = createContext<ToastActions | null>(null);
export const ToastListContext = createContext<ToastList | null>(null);
