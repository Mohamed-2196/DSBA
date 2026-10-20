import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccountYearContext, YearContext, type YearValue } from './contexts';
import { normalizeYear, type CohortYear } from './cohort';
import { local, readYear, session, VISIT_YEAR_KEY, YEAR_KEY } from './storedYear';

// The cohort whose content is shown ("browsed year"):
//   guest, or signed in without a cohort  the year chosen in this browser (localStorage)
//   signed in with a cohort               that cohort; switching to another year lasts for this visit (sessionStorage)
function write(storage: () => Storage, key: string, year: CohortYear | null): void {
  try {
    if (year) storage().setItem(key, String(year));
    else storage().removeItem(key);
  } catch {
    /* storage unavailable: keep the in-memory value */
  }
}

export function YearProvider({ children }: { children?: ReactNode }) {
  const [stored, setStored] = useState<CohortYear | null>(() => readYear(local, YEAR_KEY));
  const [account, setAccount] = useState<CohortYear | null>(null);
  const [visit, setVisit] = useState<CohortYear | null>(() => readYear(session, VISIT_YEAR_KEY));
  const accountRef = useRef<CohortYear | null>(null);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === YEAR_KEY) setStored(normalizeYear(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const year = account ? (visit ?? account) : stored;

  useEffect(() => {
    if (year) document.documentElement.setAttribute('data-year', String(year));
    else document.documentElement.removeAttribute('data-year');
  }, [year]);

  const setYear = useCallback((next: CohortYear | null) => {
    const y = normalizeYear(next);
    const own = accountRef.current;
    if (own) {
      // A student's own cohort is the default: another year is a detour for this visit.
      const detour = y === own ? null : y;
      setVisit(detour);
      write(session, VISIT_YEAR_KEY, detour);
      return;
    }
    setStored(y);
    write(local, YEAR_KEY, y);
  }, []);

  const syncAccount = useCallback((next: CohortYear | null) => {
    const prev = accountRef.current;
    accountRef.current = next;
    setAccount(next);
    // Signing out or changing cohort ends a detour (a reload keeps it: the cohort only goes from unknown to known).
    if (prev !== null && prev !== next) {
      setVisit(null);
      write(session, VISIT_YEAR_KEY, null);
    }
    if (next) {
      // Signed out later, this browser keeps showing the same cohort.
      setStored(next);
      write(local, YEAR_KEY, next);
    }
  }, []);

  // activeYear: convenience for views that need a concrete year before onboarding (Year 1 until one is chosen).
  const value = useMemo<YearValue>(() => ({ year, setYear, activeYear: year ?? 1 }), [year, setYear]);
  return (
    <AccountYearContext.Provider value={syncAccount}>
      <YearContext.Provider value={value}>{children}</YearContext.Provider>
    </AccountYearContext.Provider>
  );
}
