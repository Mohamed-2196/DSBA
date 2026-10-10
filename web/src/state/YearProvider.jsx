import { useCallback, useEffect, useMemo, useState } from 'react';
import { YearContext } from './contexts';
import { normalizeYear } from './cohort';

const KEY = 'selectedYear'; // v1 key; raw '1' | '2' | '3' (v1 wrote year.toString())

function readYear() {
  try {
    return normalizeYear(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function YearProvider({ children }) {
  const [year, setYearState] = useState(readYear);

  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setYearState(normalizeYear(e.newValue)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (year) document.documentElement.setAttribute('data-year', String(year));
    else document.documentElement.removeAttribute('data-year');
  }, [year]);

  const setYear = useCallback((next) => {
    const y = normalizeYear(next);
    setYearState(y);
    try {
      if (y) window.localStorage.setItem(KEY, String(y));
      else window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // activeYear: convenience for views that need a concrete year before onboarding (v1 defaulted to 1).
  const value = useMemo(() => ({ year, setYear, activeYear: year ?? 1 }), [year, setYear]);
  return <YearContext.Provider value={value}>{children}</YearContext.Provider>;
}
