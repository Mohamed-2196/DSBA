import {
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react';
import { Code, ImageSquare, LinkSimple, ListBullets, ListNumbers, Quotes, TextB, TextItalic, type Icon } from '@phosphor-icons/react';
import { Field, IconButton, SegmentedControl, cx, modKeyLabel } from '../../../ui';
import { bold, bulletList, code, italic, link, numberedList, quote, type EditFn } from '../lib/editing';
import { Prose } from './Prose';

type Tool = { id: string; label: string; key?: string; icon: Icon; fn: EditFn } | { sep: string };

const ALL_TOOLS: Tool[] = [
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

type EditorMode = 'write' | 'preview';
const MODES: { value: EditorMode; label: string }[] = [
  { value: 'write', label: 'Write' },
  { value: 'preview', label: 'Preview' },
];

export interface MarkdownEditorProps {
  label: ReactNode;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  /** 'full' toolbar or the 'basic' one (replies) */
  tools?: 'full' | 'basic';
  /** a Write / Preview toggle */
  preview?: boolean;
  /** Ctrl/⌘+Enter */
  onSubmit?: () => void;
  textareaRef?: RefObject<HTMLTextAreaElement>;
  /** extra attributes for the <textarea> (dir, maxLength, data-hub…) */
  textareaProps?: TextareaHTMLAttributes<HTMLTextAreaElement> & { 'data-hub'?: string };
  autoFocus?: boolean;
  /** adds an "Attach image" button to the toolbar */
  onAttachImage?: () => void;
  /** pictures pasted or dropped into the text */
  onImageFiles?: (files: File[]) => void;
  className?: string;
}

/**
 * Textarea with a small formatting toolbar (forum markdown) and an optional Write / Preview toggle.
 * Ctrl/⌘+B and +I format, Ctrl/⌘+Enter calls onSubmit.
 */
export function MarkdownEditor({
  label,
  hideLabel = false,
  hint,
  error,
  required,
  value,
  onChange,
  placeholder,
  rows = 8,
  tools = 'full',
  preview = true,
  onSubmit,
  textareaRef,
  textareaProps,
  autoFocus = false,
  onAttachImage,
  onImageFiles,
  className,
}: MarkdownEditorProps) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;
  const [mode, setMode] = useState<EditorMode>('write');
  const nextSel = useRef<[number, number] | null>(null);
  const mod = modKeyLabel();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!nextSel.current || !el) return;
    const [s, e] = nextSel.current;
    nextSel.current = null;
    el.focus({ preventScroll: true });
    el.setSelectionRange(s, e);
  });

  const apply = (fn: EditFn) => {
    const el = ref.current;
    if (mode !== 'write' || !el) {
      setMode('write');
      return;
    }
    const result = fn(value, el.selectionStart, el.selectionEnd);
    nextSel.current = result.sel;
    onChange(result.text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  // Pasting a screenshot or dropping a photo onto the text attaches it, like the "Attach image" button.
  const imagesIn = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = imagesIn(e.clipboardData?.files);
    if (!onImageFiles || !files.length) return;
    e.preventDefault();
    onImageFiles(files);
  };
  const onDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const files = imagesIn(e.dataTransfer?.files);
    if (!onImageFiles || !files.length) return;
    e.preventDefault();
    onImageFiles(files);
  };

  const toolList = tools === 'basic' ? ALL_TOOLS.filter((t) => !('sep' in t) && BASIC_IDS.has(t.id)) : ALL_TOOLS;

  return (
    <Field label={label} hint={hint} error={error} required={required} hideLabel={hideLabel} className={className}>
      {(fid, describedBy) => (
        <div className={cx('forum-editor', mode === 'preview' && 'is-preview')}>
          <div className="forum-editor__bar">
            <div className="forum-editor__tools" role="toolbar" aria-label="Formatting" aria-controls={fid}>
              {toolList.map((t) =>
                'sep' in t ? (
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
              {onAttachImage ? (
                <>
                  <span className="forum-editor__sep" aria-hidden="true" />
                  <IconButton size="sm" icon={ImageSquare} label="Attach image" tooltip tooltipSide="top" onClick={onAttachImage} data-hub="editor-attach-image" />
                </>
              ) : null}
            </div>
            {preview ? (
              <SegmentedControl size="sm" label="Editor view" className="forum-editor__mode" options={MODES} value={mode} onChange={(v) => setMode(v === 'preview' ? 'preview' : 'write')} />
            ) : null}
          </div>
          {mode === 'write' ? (
            <textarea
              ref={ref}
              id={fid}
              className="forum-editor__input"
              rows={rows}
              style={{ '--forum-rows': rows } as CSSProperties}
              value={value}
              placeholder={placeholder}
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              required={required}
              autoFocus={autoFocus}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onImageFiles ? onPaste : undefined}
              onDrop={onImageFiles ? onDrop : undefined}
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
