// The notebook's toolbar: the tools (type, pen, highlighter, eraser, lasso, laser) on one row a thumb reaches on a
// tablet, with undo, redo and the zoom; the chosen tool's options on the row below (colours and widths, the eraser's
// mode, or the text's formatting and Insert). Every control is 44 px on a touch screen.
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Code,
  Eraser,
  Function as FunctionIcon,
  HandPointing,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Lasso,
  ListBullets,
  ListChecks,
  ListNumbers,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  MathOperations,
  Paperclip,
  PenNib,
  Quotes,
  TextB,
  TextItalic,
  TextT,
  TextUnderline,
  type Icon,
} from '@phosphor-icons/react';
import { useEditorState, type Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { cx, modKeyLabel } from '../../ui';
import {
  ERASER_SIZES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTHS,
  PEN_COLORS,
  PEN_WIDTHS,
  type PenSettings,
  type Tool,
} from './surface/tools';

/** A shortcut as this computer writes it: ⌘B on a Mac, Ctrl+B elsewhere. */
function combo(key: string, shift = false): string {
  const mod = modKeyLabel();
  return mod === '⌘' ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}

const TOOLS: { id: Tool; label: string; icon: Icon; key: string }[] = [
  { id: 'type', label: 'Type', icon: TextT, key: 'T' },
  { id: 'pen', label: 'Pen', icon: PenNib, key: 'P' },
  { id: 'highlighter', label: 'Highlighter', icon: Highlighter, key: 'H' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, key: 'E' },
  { id: 'lasso', label: 'Lasso', icon: Lasso, key: 'L' },
  { id: 'laser', label: 'Laser pointer', icon: HandPointing, key: 'K' },
];

function ToolButton({
  label,
  icon: I,
  active,
  onClick,
  disabled,
  hint,
  className,
  toggle = true,
}: {
  label: string;
  icon: Icon;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
  className?: string;
  toggle?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx('nb-tool', active && 'is-active', className)}
      aria-label={label}
      aria-pressed={toggle ? !!active : undefined}
      title={hint ? `${label} (${hint})` : label}
      onClick={onClick}
      disabled={disabled}
    >
      <I aria-hidden="true" weight={active ? 'fill' : 'regular'} />
    </button>
  );
}

function Swatches({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
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

function Sizes({
  label,
  options,
  value,
  onChange,
  color,
}: {
  label: string;
  options: readonly { value: number; label: string }[];
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  return (
    <div className="nb-sizes" role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const dot = 6 + i * 6;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-label={o.label}
            title={o.label}
            className={cx('nb-size', o.value === value && 'is-active')}
            onClick={() => onChange(o.value)}
          >
            <span style={{ width: dot, height: dot, background: color }} />
          </button>
        );
      })}
    </div>
  );
}

function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="nb-choice" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cx('nb-choice__item', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
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
      underline: e.isActive('underline'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      checks: e.isActive('taskList'),
      code: e.isActive('codeBlock'),
      quote: e.isActive('blockquote'),
    }),
  });
  const chain = () => editor.chain().focus();
  const items: { label: string; keys?: string; icon?: Icon; glyph?: ReactNode; active?: boolean; run: () => void }[] = [
    {
      label: 'Heading',
      glyph: <span className="nb-tool__glyph">H1</span>,
      active: s.h1,
      run: () => chain().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'Subheading',
      glyph: <span className="nb-tool__glyph">H2</span>,
      active: s.h2,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    { label: 'Bold', keys: combo('B'), icon: TextB, active: s.bold, run: () => chain().toggleBold().run() },
    { label: 'Italic', keys: combo('I'), icon: TextItalic, active: s.italic, run: () => chain().toggleItalic().run() },
    {
      label: 'Underline',
      keys: combo('U'),
      icon: TextUnderline,
      active: s.underline,
      run: () => chain().toggleUnderline().run(),
    },
    { label: 'Bulleted list', icon: ListBullets, active: s.bullets, run: () => chain().toggleBulletList().run() },
    { label: 'Numbered list', icon: ListNumbers, active: s.numbers, run: () => chain().toggleOrderedList().run() },
    { label: 'Checklist', icon: ListChecks, active: s.checks, run: () => chain().toggleTaskList().run() },
    { label: 'Formula in the line', keys: '$…$', icon: FunctionIcon, run: () => chain().insertInlineMath().run() },
    { label: 'Formula on its own line', keys: '$$', icon: MathOperations, run: () => chain().insertBlockMath().run() },
    { label: 'Code', keys: '```', icon: Code, active: s.code, run: () => chain().toggleCodeBlock().run() },
    { label: 'Quote', keys: '>', icon: Quotes, active: s.quote, run: () => chain().toggleBlockquote().run() },
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
              className={cx('nb-tool nb-tool--format', it.active && 'is-active')}
              aria-label={it.label}
              aria-pressed={it.active === undefined ? undefined : it.active}
              title={it.keys ? `${it.label} (${it.keys})` : it.label}
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
        <button type="button" className="nb-insert" onClick={onPicture} data-hub="note-insert-picture">
          <ImageIcon aria-hidden="true" /> Picture
        </button>
        <button type="button" className="nb-insert" onClick={onFile} data-hub="note-attach-file">
          <Paperclip aria-hidden="true" /> File
        </button>
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
  onAddPage: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPicture: () => void;
  onFile: () => void;
  /** a touch screen: the finger choice is shown */
  touch: boolean;
  fingerDraws: boolean;
  onFingerDraws: (on: boolean) => void;
  zoom: number;
  fitted: boolean;
  onZoomStep: (direction: 1 | -1) => void;
  onFit: () => void;
  readOnly: boolean;
}

export function Toolbar(props: ToolbarProps) {
  const {
    tool,
    onTool,
    pens,
    onPens,
    editor,
    canType,
    onAddPage,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onPicture,
    onFile,
    touch,
    fingerDraws,
    onFingerDraws,
    zoom,
    fitted,
    onZoomStep,
    onFit,
    readOnly,
  } = props;
  const visible = readOnly ? TOOLS.filter((t) => t.id === 'laser') : TOOLS;
  let options: ReactNode = null;
  if (tool === 'pen') {
    options = (
      <>
        <Swatches
          label="Pen colour"
          options={PEN_COLORS}
          value={pens.pen.color}
          onChange={(color) => onPens({ ...pens, pen: { ...pens.pen, color } })}
        />
        <Sizes
          label="Pen width"
          options={PEN_WIDTHS}
          value={pens.pen.width}
          color={pens.pen.color}
          onChange={(width) => onPens({ ...pens, pen: { ...pens.pen, width } })}
        />
      </>
    );
  } else if (tool === 'highlighter') {
    options = (
      <>
        <Swatches
          label="Highlighter colour"
          options={HIGHLIGHTER_COLORS}
          value={pens.highlighter.color}
          onChange={(color) => onPens({ ...pens, highlighter: { ...pens.highlighter, color } })}
        />
        <Sizes
          label="Highlighter width"
          options={HIGHLIGHTER_WIDTHS}
          value={pens.highlighter.width}
          color={pens.highlighter.color}
          onChange={(width) => onPens({ ...pens, highlighter: { ...pens.highlighter, width } })}
        />
      </>
    );
  } else if (tool === 'eraser') {
    options = (
      <>
        <Choice
          label="What the eraser takes"
          options={[
            { value: 'stroke', label: 'Whole strokes' },
            { value: 'partial', label: 'Precise' },
          ]}
          value={pens.eraser.mode}
          onChange={(mode) => onPens({ ...pens, eraser: { ...pens.eraser, mode } })}
        />
        <Choice
          label="Eraser size"
          options={ERASER_SIZES}
          value={pens.eraser.size}
          onChange={(size) => onPens({ ...pens, eraser: { ...pens.eraser, size } })}
        />
      </>
    );
  } else if (tool === 'lasso') {
    options = (
      <p className="nb-toolbar__hint">Draw around handwriting to select it. Then drag it, recolour it or delete it.</p>
    );
  } else if (tool === 'laser') {
    options = (
      <p className="nb-toolbar__hint">Point at the page to show what you mean. The trail fades and is never saved.</p>
    );
  } else if (tool === 'type' && editor && canType) {
    options = <TextOptions editor={editor} onPicture={onPicture} onFile={onFile} />;
  } else if (tool === 'type') {
    options = (
      <p className="nb-toolbar__hint">
        Typing goes on paper after the PDF.{' '}
        <button type="button" className="nb-linkbutton" onClick={onAddPage}>
          Add a page
        </button>
      </p>
    );
  }

  const inkTool = tool !== 'type' && tool !== 'laser';
  return (
    <div className="nb-toolbar" data-hub="note-toolbar">
      <div className="nb-toolbar__row" role="toolbar" aria-label="Tools">
        <div className="nb-tools" role="group" aria-label="Tool">
          {visible.map((t) => (
            <ToolButton
              key={t.id}
              label={t.label}
              icon={t.icon}
              hint={t.key}
              active={tool === t.id}
              onClick={() => onTool(t.id)}
            />
          ))}
        </div>
        {readOnly ? null : (
          <div className="nb-tools" role="group" aria-label="History">
            <ToolButton
              label="Undo"
              icon={ArrowCounterClockwise}
              hint={combo('Z')}
              onClick={onUndo}
              disabled={!canUndo}
              toggle={false}
            />
            <ToolButton
              label="Redo"
              icon={ArrowClockwise}
              hint={combo('Z', true)}
              onClick={onRedo}
              disabled={!canRedo}
              toggle={false}
            />
          </div>
        )}
        <div className="nb-tools nb-tools--end" role="group" aria-label="Zoom">
          {touch && inkTool && !readOnly ? (
            <button
              type="button"
              className={cx('nb-finger', fingerDraws && 'is-active')}
              aria-pressed={fingerDraws}
              onClick={() => onFingerDraws(!fingerDraws)}
              title={
                fingerDraws
                  ? 'Your finger draws. Turn off to scroll with it'
                  : 'Your finger scrolls. Turn on to draw with it'
              }
            >
              <Hand aria-hidden="true" weight={fingerDraws ? 'fill' : 'regular'} />
              <span>Draw with finger</span>
            </button>
          ) : null}
          <ToolButton label="Zoom out" icon={MagnifyingGlassMinus} onClick={() => onZoomStep(-1)} toggle={false} />
          <button
            type="button"
            className={cx('nb-zoom', fitted && 'is-fitted')}
            onClick={onFit}
            title="Fit the page to the window"
            aria-label={`Zoom ${Math.round(zoom * 100)}%. Fit the page to the window`}
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolButton label="Zoom in" icon={MagnifyingGlassPlus} onClick={() => onZoomStep(1)} toggle={false} />
        </div>
      </div>
      {options && !readOnly ? (
        <div
          className="nb-toolbar__row nb-toolbar__row--options"
          role="group"
          aria-label={`${TOOLS.find((t) => t.id === tool)?.label ?? 'Tool'} options`}
        >
          {options}
        </div>
      ) : null}
    </div>
  );
}
