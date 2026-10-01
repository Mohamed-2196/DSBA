import { useLayoutEffect, useRef, useState } from 'react';
import { Code, LinkSimple, ListBullets, ListNumbers, Quotes, TextB, TextItalic } from '@phosphor-icons/react';
import { Field, IconButton, SegmentedControl, cx, modKeyLabel } from '../../../ui';
import { bold, bulletList, code, italic, link, numberedList, quote } from '../lib/editing.js';
import { Prose } from './Prose.jsx';

const ALL_TOOLS = [
  { id: 'bold', label: 'Bold', key: 'B', icon: TextB, fn: bold },
  { id: 'italic', label: 'Italic', key: 'I', icon: TextItalic, fn: italic },
  { id: 'code', label: 'Formula or code', icon: Code, fn: code },
  { sep: 'a' },
  { id: 'ul', label: 'Bulleted list', icon: ListBullets, fn: bulletList },
  { id: 'ol', label: 'Numbered list', icon: ListNumbers, fn: numberedList },
  { id: 'quote', label: 'Quote', icon: Quotes, fn: quote },
  { sep: 'b' },
  { id: 'link', label: 'Link', icon: LinkSimple, fn: link },
];
const BASIC_IDS = new Set(['bold', 'italic', 'code', 'ul', 'link']);

/**
 * Textarea with a small formatting toolbar (forum markdown) and an optional Write / Preview toggle.
 * Ctrl/⌘+B and +I format, Ctrl/⌘+Enter calls onSubmit.
 * @param {'full'|'basic'} tools
 * @param {object} textareaProps  extra attributes for the <textarea> (e.g. data-pulse)
 */
export function MarkdownEditor({
  label, hideLabel = false, hint, error, required, value, onChange, placeholder, rows = 8, tools = 'full', preview = true,
  onSubmit, textareaRef, textareaProps, autoFocus = false, className,
}) {
  const localRef = useRef(null);
  const ref = textareaRef || localRef;
  const [mode, setMode] = useState('write');
  const nextSel = useRef(null);
  const mod = modKeyLabel();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!nextSel.current || !el) return;
    const [s, e] = nextSel.current;
    nextSel.current = null;
    el.focus({ preventScroll: true });
    el.setSelectionRange(s, e);
  });

  const apply = (fn) => {
    const el = ref.current;
    if (mode !== 'write' || !el) {
      setMode('write');
      return;
    }
    const result = fn(value, el.selectionStart, el.selectionEnd);
    nextSel.current = result.sel;
    onChange(result.text);
  };

  const onKeyDown = (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') {
      e.preventDefault();
      apply(bold);
    } else if (k === 'i') {
      e.preventDefault();
      apply(italic);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const toolList = tools === 'basic' ? ALL_TOOLS.filter((t) => BASIC_IDS.has(t.id)) : ALL_TOOLS;

  return (
    <Field label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={className}>
      {(fid, describedBy) => (
        <div className={cx('forum-editor', mode === 'preview' && 'is-preview')}>
          <div className="forum-editor__bar">
            <div className="forum-editor__tools" role="toolbar" aria-label="Formatting" aria-controls={fid}>
              {toolList.map((t) =>
                t.sep ? (
                  <span key={t.sep} className="forum-editor__sep" aria-hidden="true" />
                ) : (
                  <IconButton
                    key={t.id}
                    size="sm"
                    icon={t.icon}
                    label={t.key ? `${t.label} (${mod} ${t.key})` : t.label}
                    tooltip
                    tooltipSide="top"
                    disabled={mode === 'preview'}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(t.fn)}
                  />
                ),
              )}
            </div>
            {preview ? (
              <SegmentedControl
                size="sm"
                label="Editor view"
                className="forum-editor__mode"
                options={[
                  { value: 'write', label: 'Write' },
                  { value: 'preview', label: 'Preview' },
                ]}
                value={mode}
                onChange={setMode}
              />
            ) : null}
          </div>
          {mode === 'write' ? (
            <textarea
              ref={ref}
              id={fid}
              className="forum-editor__input"
              rows={rows}
              style={{ '--forum-rows': rows }}
              value={value}
              placeholder={placeholder}
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              required={required}
              autoFocus={autoFocus}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              {...textareaProps}
            />
          ) : (
            <div className="forum-editor__preview" id={fid} tabIndex={-1}>
              {value.trim() ? <Prose text={value} /> : <p className="forum-editor__empty">Nothing to preview yet. Switch to Write and add some details.</p>}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
