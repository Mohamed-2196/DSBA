import { createContext, useContext } from 'react';
import type { CareerDoc } from '../../api/types';

/** The Career Navigator's content, provided by CareerPage once it has loaded. */
export const CareerContext = createContext<CareerDoc | null>(null);

export function useCareerData(): CareerDoc {
  const data = useContext(CareerContext);
  if (!data) throw new Error('useCareerData() must be used inside the Career Navigator page');
  return data;
}
