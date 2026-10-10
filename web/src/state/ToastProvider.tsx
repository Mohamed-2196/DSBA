import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastActionsContext, ToastListContext, type Toast, type ToastInput } from './contexts';

const MAX_TOASTS = 4;

export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast: ToastInput) => {
    seq.current += 1;
    const id = `t${seq.current}`;
    const t: Toast = { ...toast, tone: toast.tone ?? 'info', duration: toast.duration ?? 5000, id };
    setToasts((list) => [...list, t].slice(-MAX_TOASTS));
    return id;
  }, []);

  const actions = useMemo(() => ({ push, dismiss }), [push, dismiss]);
  const list = useMemo(() => ({ toasts, dismiss }), [toasts, dismiss]);
  return (
    <ToastActionsContext.Provider value={actions}>
      <ToastListContext.Provider value={list}>{children}</ToastListContext.Provider>
    </ToastActionsContext.Provider>
  );
}
