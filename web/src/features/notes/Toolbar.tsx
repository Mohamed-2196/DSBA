// The notebook's toolbar: the tools (type, pen, highlighter, eraser, lasso, laser) on one row a thumb reaches on a
// tablet, undo and redo, and the chosen tool's options on the row below (colours and widths, the eraser's mode, or
// the text's formatting and Insert).
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Code,
  Eraser,
  Function as FunctionIcon,
  HandPointing,
  Highlighter,
  Image as ImageIcon,
  Lasso,
  ListBullets,
  ListChecks,
  ListNumbers,
  MathOperations,
  Paperclip,
  PenNib,
  Quotes,
  TextB,
  TextItalic,
  TextT,
  type Icon,
} from '@phosphor-icons/react';
import { useEditorState, type Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { cx } from '../../ui';
import { ERASER_SIZES, HIGHLIGHTER_COLORS, HIGHLIGHTER_WIDTHS, PEN_COLORS, PEN_WIDTHS, isInkTool, type PenSettings, type Tool } from './surface/tools';

const TOOLS: { id: Tool; label: string; icon: Icon; key: string }[] = [
  { id: 'type', label: 'Type', icon: TextT, key: 'T' },
  { id: 'pen', label: 'Pen', icon: PenNib, key: 'P' },
  { id: 'highlighter', label: 'Highlighter', icon: Highlighter, key: 'H' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'lasso', label: 'Lasso: select and move', icon: Lasso, key: 'L' },
  { id: 'laser', label: 'Laser pointer', icon: HandPointing, key: 'K' },
];

function ToolButton({ label, icon: I, active, onClick, disabled, hint, className }: { label: string; icon: Icon; active?: boolean; onClick: () => void; disabled?: boolean; hint?: string; className?: string }) {
  return (
    <button
      type="button"
      className={cx('nb-tool', active && 'is-active', className)}
      aria-label={label}
      aria-pressed={active}
      title={hint ? `${label} (${hint})` : label}
      onClick={onClick}
      disabled={disabled}
    >
      <I aria-hidden="true" weight={active ? 'fill' : 'regular'} />
    </button>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: readonly { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="nb-swatches" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.label}
          title={o.label}
          className={cx('nb-swatch', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          <span style={{ background: o.value }} />
        </button>
      ))}
    </div>
  );
}

function Widths({ label, options, value, onChange, color }: { label: string; options: readonly { value: number; label: string }[]; value: number; onChange: (v: number) => void; color: string }) {
  const max = options[options.length - 1].value;
  return (
    <div className="nb-widths" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const dot = 6 + (o.value / max) * 14;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-label={o.label}
            title={o.label}
            className={cx('nb-width', o.value === value && 'is-active')}
            onClick={() => onChange(o.value)}
          >
            <span style={{ width: dot, height: dot, background: color }} />
          </button>
        );
      })}
    </div>
  );
}

function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="nb-choice" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={cx('nb-choice__item', o.value === value && 'is-active')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The text's formatting, following where the cursor is. */
function TextOptions({ editor, onPicture, onFile }: { editor: Editor; onPicture: () => void; onFile: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      checks: e.isActive('taskList'),
      code: e.isActive('codeBlock'),
      quote: e.isActive('blockquote'),
    }),
  });
  const chain = () => editor.chain().focus();
  const items: { label: string; icon?: Icon; glyph?: ReactNode; active?: boolean; run: () => void }[] = [
    { label: 'Heading', glyph: <span className="nb-tool__glyph">H1</span>, active: s.h1, run: () => chain().toggleHeading({ level: 1 }).run() },
    { label: 'Subheading', glyph: <span className="nb-tool__glyph">H2</span>, active: s.h2, run: () => chain().toggleHeading({ level: 2 }).run() },
    { label: 'Bold', icon: TextB, active: s.bold, run: () => chain().toggleBold().run() },
    { label: 'Italic', icon: TextItalic, active: s.italic, run: () => chain().toggleItalic().run() },
    { label: 'Bulleted list', icon: ListBullets, active: s.bullets, run: () => chain().toggleBulletList().run() },
    { label: 'Numbered list', icon: ListNumbers, active: s.numbers, run: () => chain().toggleOrderedList().run() },
    { label: 'Checklist', icon: ListChecks, active: s.checks, run: () => chain().toggleTaskList().run() },
    { label: 'Formula in the line', icon: FunctionIcon, run: () => chain().insertInlineMath().run() },
    { label: 'Formula on its own line', icon: MathOperations, run: () => chain().insertBlockMath().run() },
    { label: 'Code', icon: Code, active: s.code, run: () => chain().toggleCodeBlock().run() },
    { label: 'Quote', icon: Quotes, active: s.quote, run: () => chain().toggleBlockquote().run() },
  ];
  return (
    <>
      <div className="nb-format" role="group" aria-label="Formatting">
        {items.map((it) => {
          const IconComp = it.icon;
          return (
            <button
              key={it.label}
              type="button"
              className={cx('nb-tool nb-tool--sm', it.active && 'is-active')}
              aria-label={it.label}
              aria-pressed={it.active}
              title={it.label}
              // keep the text's selection: the button never takes the focus from it
              onMouseDown={(e) => e.preventDefault()}
              onClick={it.run}
            >
              {it.glyph ? it.glyph : IconComp ? <IconComp aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <span className="nb-toolbar__sep" aria-hidden="true" />
      <div className="nb-format" role="group" aria-label="Insert">
        <ToolButton label="Insert a picture" icon={ImageIcon} onClick={onPicture} />
        <ToolButton label="Attach a file" icon={Paperclip} onClick={onFile} />
      </div>
    </>
  );
}

export interface ToolbarProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  pens: PenSettings;
  onPens: (p: PenSettings) => void;
  editor: Editor | null;
  /** typing has no paper to go on (a note on a PDF without pages of its own) */
  canType: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPicture: () => void;
  onFile: () => void;
  fingerDraws: boolean;
  onFingerDraws: (on: boolean) => void;
  stylusSeen: boolean;
  readOnly: boolean;
}

export function Toolbar({ tool, onTool, pens, onPens, editor, canType, canUndo, canRedo, onUndo, onRedo, onPicture, onFile, fingerDraws, onFingerDraws, stylusSeen, readOnly }: ToolbarProps) {
  const visible = readOnly ? TOOLS.filter((t) => t.id === 'laser') : TOOLS;
  let options: ReactNode = null;
  if (tool === 'pen') {
    options = (
      <>
        <Swatches label="Pen colour" options={PEN_COLORS} value={pens.pen.color} onChange={(color) => onPens({ ...pens, pen: { ...pens.pen, color } })} />
        <Widths label="Pen width" options={PEN_WIDTHS} value={pens.pen.width} color={pens.pen.color} onChange={(width) => onPens({ ...pens, pen: { ...pens.pen, width } })} />
      </>
    );
  } else if (tool === 'highlighter') {
    options = (
      <>
        <Swatches label="Highlighter colour" options={HIGHLIGHTER_COLORS} value={pens.highlighter.color} onChange={(color) => onPens({ ...pens, highlighter: { ...pens.highlighter, color } })} />
        <Widths label="Highlighter width" options={HIGHLIGHTER_WIDTHS} value={pens.highlighter.width} color={pens.highlighter.color} onChange={(width) => onPens({ ...pens, highlighter: { ...pens.highlighter, width } })} />
      </>
    );
  } else if (tool === 'eraser') {
    options = (
      <>
        <Choice
          label="Eraser"
          options={[
            { value: 'stroke', label: 'Whole lines' },
            { value: 'partial', label: 'Precise' },
          ]}
          value={pens.eraser.mode}
          onChange={(mode) => onPens({ ...pens, eraser: { ...pens.eraser, mode } })}
        />
        <Choice label="Eraser size" options={ERASER_SIZES} value={pens.eraser.size} onChange={(size) => onPens({ ...pens, eraser: { ...pens.eraser, size } })} />
      </>
    );
  } else if (tool === 'lasso') {
    options = <p className="nb-toolbar__hint">Draw around ink to select it, then drag it, change its colour or delete it.</p>;
  } else if (tool === 'laser') {
    options = <p className="nb-toolbar__hint">Point at the page to show someone what you mean. It fades away and isn’t saved.</p>;
  } else if (tool === 'type' && editor && canType) {
    options = <TextOptions editor={editor} onPicture={onPicture} onFile={onFile} />;
  } else if (tool === 'type') {
    options = <p className="nb-toolbar__hint">Add a page to type on: it goes after the PDF.</p>;
  }

  const inkTool = isInkTool(tool) && tool !== 'laser';
  return (
    <div className="nb-toolbar" data-hub="note-toolbar">
      <div className="nb-toolbar__row" role="toolbar" aria-label="Tools">
        <div className="nb-tools" role="group" aria-label="Tool">
          {visible.map((t) => (
            <ToolButton key={t.id} label={t.label} icon={t.icon} hint={t.key} active={tool === t.id} onClick={() => onTool(t.id)} />
          ))}
        </div>
        {readOnly ? null : (
          <div className="nb-tools nb-tools--history" role="group" aria-label="History">
            <ToolButton label="Undo" icon={ArrowCounterClockwise} onClick={onUndo} disabled={!canUndo} />
            <ToolButton label="Redo" icon={ArrowClockwise} onClick={onRedo} disabled={!canRedo} />
          </div>
        )}
      </div>
      {options && !readOnly ? (
        <div className="nb-toolbar__row nb-toolbar__row--options" role="group" aria-label="Options">
          {options}
          {inkTool ? (
            <label className="nb-fingers" title={stylusSeen ? 'A stylus was used here: fingers scroll unless this is on' : undefined}>
              <input type="checkbox" checked={fingerDraws} onChange={(e) => onFingerDraws(e.target.checked)} />
              Draw with a finger
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
