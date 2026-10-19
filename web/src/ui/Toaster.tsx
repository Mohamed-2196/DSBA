import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToastList } from '../state/hooks';
import type { Toast as ToastData } from '../state/contexts';
import { Icon } from './Icon';
import * as glyph from './icons/glyphs';
import { cx } from './internal';
import './Toaster.css';

const GLYPHS = { info: glyph.info, success: glyph.success, alert: glyph.error };

function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const started = useRef(0);

  useEffect(() => {
    if (!toast.duration || paused || leaving) return undefined;
    started.current = Date.now();
    const t = setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current -= Date.now() - started.current;
    };
  }, [toast.duration, paused, leaving]);

  useEffect(() => {
    if (!leaving) return undefined;
    const t = setTimeout(() => onDismiss(toast.id), 180);
    return () => clearTimeout(t);
  }, [leaving, onDismiss, toast.id]);

  return (
    // A toast is a dark card in either theme ("ink on light, raised on dark"), so it takes the dark tokens.
    <div
      data-theme="dark"
      className={cx('ui-toast', `ui-toast--${toast.tone}`, leaving && 'is-leaving')}
      role={toast.tone === 'alert' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon glyph={GLYPHS[toast.tone] ?? glyph.info} size={24} className="ui-toast__icon" />
      <div className="ui-toast__text">
        <p className="ui-toast__title">{toast.title}</p>
        {toast.body ? <p className="ui-toast__body">{toast.body}</p> : null}
        {toast.action ? (
          <button
            type="button"
            className="ui-toast__action"
            onClick={() => {
              toast.action?.onClick?.();
              setLeaving(true);
            }}
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="ui-toast__close"
        aria-label="Dismiss notification"
        onClick={() => setLeaving(true)}
      >
        <Icon glyph={glyph.close} size={16} />
      </button>
    </div>
  );
}

/** Renders toasts pushed with useToast(). Mounted once by the shell. */
export function Toaster() {
  const { toasts, dismiss } = useToastList();
  return createPortal(
    <div className="ui-toaster" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>,
    document.body,
  );
}
