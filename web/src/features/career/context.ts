import { createContext, useContext } from 'react';
import type { CareerData } from './types';

/** The Career Navigator's content, provided by CareerPage once it has loaded. */
export const CareerContext = createContext<CareerData | null>(null);

export function useCareerData(): CareerData {
  const data = useContext(CareerContext);
  if (!data) throw new Error('useCareerData() must be used inside the Career Navigator page');
  return data;
}
