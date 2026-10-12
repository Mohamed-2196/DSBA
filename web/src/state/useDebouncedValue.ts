import { useEffect, useState } from 'react';

/** `value`, once it has stopped changing for `ms` milliseconds: search as you type without a request per key.
 *  The one copy for every area (code quality review CQ-5). */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}
