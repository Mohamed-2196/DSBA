import { useCallback, useMemo, useRef, useState } from 'react';
import { ToastActionsContext, ToastListContext } from './contexts';

const MAX_TOASTS = 4;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  /** push({ title, body?, tone?: 'info'|'success'|'alert', duration?: ms (0 = sticky), action?: { label, onClick } }) → id */
  const push = useCallback((toast) => {
    seq.current += 1;
    const id = `t${seq.current}`;
    const t = { tone: 'info', duration: 5000, ...toast, id };
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
