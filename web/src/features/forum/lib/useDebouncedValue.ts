import { useEffect, useState } from 'react';

/** `value`, once it has stopped changing for `ms` (search as you type without a request per key). */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
