// The notebook's toolbar: the view (the text alone, or the pages), then the tools (type, pen, highlighter, eraser,
// lasso, laser) on one row a thumb reaches on a tablet, with undo, redo and the zoom; the chosen tool's options on the
// row below (colours and widths, the eraser's mode, or the text's formatting and Insert). In the text alone there are
// no ink tools and no zoom: picking Page brings them. Every control is 44 px on a touch screen.
import { useEditorState, type Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { Deskmate, Icon, cx, glyph, modKeyLabel, type Glyph } from '../../ui';
import {
  ERASER_SIZES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_WIDTHS,
  PEN_COLORS,
  PEN_WIDTHS,
  type NoteView,
  type PenSettings,
  type Tool,
} from './surface/tools';

/** A shortcut as this computer writes it: ⌘B on a Mac, Ctrl+B elsewhere. */
function combo(key: string, shift = false): string {
  const mod = modKeyLabel();
  return mod === '⌘' ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}

const TOOLS: { id: Tool; label: string; icon: Glyph; key: string }[] = [
  { id: 'type', label: 'Type', icon: glyph.text, key: 'T' },
  { id: 'pen', label: 'Pen', icon: glyph.pen, key: 'P' },
  { id: 'highlighter', label: 'Highlighter', icon: glyph.highlighter, key: 'H' },
  { id: 'eraser', label: 'Eraser', icon: glyph.eraser, key: 'E' },
  { id: 'lasso', label: 'Lasso', icon: glyph.lasso, key: 'L' },
  { id: 'laser', label: 'Laser pointer', icon: glyph.laser, key: 'K' },
];

function ToolArtView({ art, active }: { art: Glyph; active: boolean }) {
  return <Icon glyph={art} active={active} />;
}

function ToolButton({
  label,
  icon,
  active,
  onClick,
  disabled,
  hint,
  className,
  toggle = true,
}: {
  label: string;
  icon: Glyph;
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
      title={hint && hint.length === 1 ? undefined : hint ? `${label} (${hint})` : label}
      onClick={onClick}
      disabled={disabled}
    >
      <ToolArtView art={icon} active={!!active} />
      {hint && hint.length === 1 ? (
        <span className="nb-tool__tip" aria-hidden="true">
          {label} <kbd>{hint}</kbd>
        </span>
      ) : null}
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
  const items: {
    label: string;
    keys?: string;
    icon?: Glyph;
    glyph?: ReactNode;
    active?: boolean;
    run: () => void;
  }[] = [
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
    { label: 'Bold', keys: combo('B'), icon: glyph.bold, active: s.bold, run: () => chain().toggleBold().run() },
    {
      label: 'Italic',
      keys: combo('I'),
      icon: glyph.italic,
      active: s.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      label: 'Underline',
      keys: combo('U'),
      icon: glyph.underline,
      active: s.underline,
      run: () => chain().toggleUnderline().run(),
    },
    { label: 'Bulleted list', icon: glyph.list, active: s.bullets, run: () => chain().toggleBulletList().run() },
    {
      label: 'Numbered list',
      icon: glyph.listNumbers,
      active: s.numbers,
      run: () => chain().toggleOrderedList().run(),
    },
    { label: 'Checklist', icon: glyph.checklist, active: s.checks, run: () => chain().toggleTaskList().run() },
    { label: 'Formula in the line', keys: '$…$', icon: glyph.formula, run: () => chain().insertInlineMath().run() },
    { label: 'Formula on its own line', keys: '$$', icon: glyph.math, run: () => chain().insertBlockMath().run() },
    { label: 'Code', keys: '```', icon: glyph.code, active: s.code, run: () => chain().toggleCodeBlock().run() },
    { label: 'Quote', keys: '>', icon: glyph.quote, active: s.quote, run: () => chain().toggleBlockquote().run() },
  ];
  return (
    <>
      <div className="nb-format" role="group" aria-label="Formatting">
        {items.map((it) => {
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
              {it.glyph ? it.glyph : it.icon ? <Icon glyph={it.icon} /> : null}
            </button>
          );
        })}
      </div>
      <span className="nb-toolbar__sep" aria-hidden="true" />
      <div className="nb-format" role="group" aria-label="Insert">
        <button type="button" className="nb-insert" onClick={onPicture} data-hub="note-insert-picture">
          <Icon glyph={glyph.image} /> Picture
        </button>
        <button type="button" className="nb-insert" onClick={onFile} data-hub="note-attach-file">
          <Icon glyph={glyph.attach} /> File
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
  /** the view shown (null: only the pages, a note on a PDF without paper) */
  view: NoteView | null;
  onView: (view: NoteView) => void;
  /** more for the text, after Insert (the lesson panel's video time) */
  extra: ReactNode;
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
    view,
    onView,
    extra,
  } = props;
  const text = view === 'text';
  const visible = text ? [] : readOnly ? TOOLS.filter((t) => t.id === 'laser') : TOOLS;
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
    options = (
      <>
        <TextOptions editor={editor} onPicture={onPicture} onFile={onFile} />
        {extra ? (
          <>
            <span className="nb-toolbar__sep" aria-hidden="true" />
            {extra}
          </>
        ) : null}
      </>
    );
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
        {/* Jot, beside the pen tools: "you're in the notebook" */}
        <Deskmate mate="jot" size={44} className="nb-toolbar__mate" />
        {view ? (
          <Choice
            label="Show"
            options={[
              { value: 'text', label: 'Text' },
              { value: 'page', label: 'Pages' },
            ]}
            value={view}
            onChange={onView}
          />
        ) : null}
        {visible.length ? (
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
        ) : null}
        {readOnly ? null : (
          <div className="nb-tools" role="group" aria-label="History">
            <ToolButton
              label="Undo"
              icon={glyph.undo}
              hint={combo('Z')}
              onClick={onUndo}
              disabled={!canUndo}
              toggle={false}
            />
            <ToolButton
              label="Redo"
              icon={glyph.undo}
              className="nb-tool--redo"
              hint={combo('Z', true)}
              onClick={onRedo}
              disabled={!canRedo}
              toggle={false}
            />
          </div>
        )}
        {text ? null : (
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
                <Icon glyph={glyph.hand} active={fingerDraws} />
                <span>Draw with finger</span>
              </button>
            ) : null}
            <ToolButton label="Zoom out" icon={glyph.zoomOut} onClick={() => onZoomStep(-1)} toggle={false} />
            <button
              type="button"
              className={cx('nb-zoom', fitted && 'is-fitted')}
              onClick={onFit}
              title="Fit the page to the window"
              aria-label={`Zoom ${Math.round(zoom * 100)}%. Fit the page to the window`}
            >
              {Math.round(zoom * 100)}%
            </button>
            <ToolButton label="Zoom in" icon={glyph.zoomIn} onClick={() => onZoomStep(1)} toggle={false} />
          </div>
        )}
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
