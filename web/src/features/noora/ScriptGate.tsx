// Her chat waits for her words (GET /mini-noora/script): `children` gets them once they have loaded.
import type { ReactNode } from 'react';
import type { NooraScript } from '../../api/types';
import { useNooraScript } from './script';

export interface ScriptGateProps {
  children: (script: NooraScript) => ReactNode;
  fallback: ReactNode;
  error: (retry: () => void, error: unknown, retrying: boolean) => ReactNode;
}

export function ScriptGate({ children, fallback, error }: ScriptGateProps) {
  const script = useNooraScript();
  if (script.data) return <>{children(script.data)}</>;
  if (script.isError) return <>{error(() => void script.refetch(), script.error, script.isFetching)}</>;
  return <>{fallback}</>;
}
