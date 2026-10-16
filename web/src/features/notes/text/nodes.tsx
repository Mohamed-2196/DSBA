// The note editor's own nodes: formulas set with the hub's KaTeX ($…$ in a line, $$…$$ on their own), and the
// note's pictures and files (uploads served only to their owner: /notes/files/{id}). The API accepts exactly these
// names and attributes (api/app/services/note_doc.py).
import {
  Crop,
  DotsSixVertical,
  DownloadSimple,
  File as FileIcon,
  ImageBroken,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  Trash,
} from '@phosphor-icons/react';
import { InputRule, Node, mergeAttributes, nodeInputRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatSize } from '../../../api/uploads';
import { Button, TeX, cx } from '../../../ui';
import { noteFileHref } from '../api';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteMath: {
      /** a formula in the line, opened for typing */
      insertInlineMath: (latex?: string) => ReturnType;
      /** a formula on its own line, opened for typing */
      insertBlockMath: (latex?: string) => ReturnType;
    };
    noteFiles: {
      insertNotePicture: (attrs: {
        upload: string;
        alt: string;
        width?: string;
        align?: 'left' | 'center' | 'right';
        aspectRatio?: string | null;
        objectFit?: 'contain' | 'cover';
      }) => ReturnType;
      insertNoteFile: (attrs: { upload: string; name: string; size: number }) => ReturnType;
    };
  }
}

/** A formula: set by KaTeX; pressing it (while writing) opens its LaTeX for editing. */
function MathView({ node, updateAttributes, deleteNode, editor, selected }: ReactNodeViewProps) {
  const display = node.type.name === 'blockMath';
  const latex = String(node.attrs.latex ?? '');
  const fresh = !!node.attrs.fresh;
  const [editing, setEditing] = useState(fresh && editor.isEditable);
  const [text, setText] = useState(latex);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (fresh) updateAttributes({ fresh: null });
    // Only on the first render: `fresh` marks a formula just inserted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = () => {
    setEditing(false);
    if (!text.trim()) deleteNode();
    else updateAttributes({ latex: text.trim() });
    editor.commands.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      done();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setText(latex);
      setEditing(false);
      if (!latex) deleteNode();
      editor.commands.focus();
    }
  };

  return (
    <NodeViewWrapper as={display ? 'div' : 'span'} className={cx('nb-math', display && 'nb-math--block', selected && 'is-selected')}>
      {editing ? (
        <span className="nb-math__edit" contentEditable={false}>
          <textarea
            ref={input}
            className="nb-math__input"
            value={text}
            rows={display ? 2 : 1}
            spellCheck={false}
            aria-label="Formula in LaTeX"
            placeholder="\frac{a}{b}"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onBlur={done}
            dir="ltr"
          />
          {text.trim() ? <TeX tex={text} display={display} className="nb-math__preview" /> : null}
        </span>
      ) : (
        <button
          type="button"
          className="nb-math__shown"
          contentEditable={false}
          onClick={() => editor.isEditable && setEditing(true)}
          aria-label={`Formula: ${latex}${editor.isEditable ? '. Press to edit' : ''}`}
        >
          <TeX tex={latex || '\\square'} display={display} />
        </button>
      )}
    </NodeViewWrapper>
  );
}

const mathAttrs = {
  latex: { default: '' },
  // set on a formula just inserted, so it opens for typing; never saved (the view clears it at once)
  fresh: { default: null, rendered: false },
};

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => mathAttrs,
  parseHTML: () => [{ tag: 'span[data-math]', getAttrs: (el) => ({ latex: (el as HTMLElement).getAttribute('data-math') ?? '' }) }],
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-math': node.attrs.latex }), `$${String(node.attrs.latex)}$`],
  renderText: ({ node }) => `$${String(node.attrs.latex)}$`,
  addNodeView: () => ReactNodeViewRenderer(MathView),
  addInputRules() {
    // $x^2$ typed in a line becomes a formula
    return [
      new InputRule({
        find: /(?:^|[^$\\])\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          const start = range.from + (match[0].startsWith('$') ? 0 : 1);
          state.tr.replaceWith(start, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },
  addCommands() {
    return {
      insertInlineMath:
        (latex = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex, fresh: latex ? null : true } }),
    };
  },
});

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => mathAttrs,
  parseHTML: () => [{ tag: 'div[data-math]', getAttrs: (el) => ({ latex: (el as HTMLElement).getAttribute('data-math') ?? '' }) }],
  renderHTML: ({ node, HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-math': node.attrs.latex }), `$$${String(node.attrs.latex)}$$`],
  renderText: ({ node }) => `$$${String(node.attrs.latex)}$$`,
  addNodeView: () => ReactNodeViewRenderer(MathView),
  addInputRules() {
    // $$ at the start of a line opens a formula on its own line
    return [nodeInputRule({ find: /^\$\$\s$/, type: this.type, getAttributes: () => ({ latex: '', fresh: true }) })];
  },
  addCommands() {
    return {
      insertBlockMath:
        (latex = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex, fresh: latex ? null : true } }),
    };
  },
});

function PictureView({ node, updateAttributes, deleteNode, editor, selected }: ReactNodeViewProps) {
  const upload = String(node.attrs.upload ?? '');
  const alt = String(node.attrs.alt ?? '');
  const width = String(node.attrs.width ?? '100%');
  const align = String(node.attrs.align ?? 'center');
  const aspectRatio = node.attrs.aspectRatio ? String(node.attrs.aspectRatio) : null;
  const objectFit = String(node.attrs.objectFit ?? 'contain');
  const [broken, setBroken] = useState(false);
  const [showCropMenu, setShowCropMenu] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const isEditable = editor.isEditable;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const parent = boxRef.current?.parentElement;
    const parentWidth = parent ? parent.getBoundingClientRect().width : 700;
    const startBoxWidth = boxRef.current ? boxRef.current.getBoundingClientRect().width : parentWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const effectiveDelta = align === 'right' ? -deltaX : deltaX;
      const newWidthPx = Math.max(120, Math.min(parentWidth, startBoxWidth + effectiveDelta));
      const newPercent = Math.min(100, Math.max(20, Math.round((newWidthPx / parentWidth) * 100)));
      updateAttributes({ width: `${newPercent}%` });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const alignClass =
    align === 'left' ? 'is-aligned-left' : align === 'right' ? 'is-aligned-right' : 'is-aligned-center';

  return (
    <NodeViewWrapper
      as="figure"
      className={cx('nb-picture-wrapper', alignClass, selected && 'is-selected')}
    >
      <div
        ref={boxRef}
        className="nb-picture-box"
        style={{ width: width || '100%' }}
      >
        {isEditable && (
          <div className="nb-picture-toolbar" contentEditable={false}>
            <span
              className="nb-picture-toolbar__grip"
              data-drag-handle=""
              title="Drag to move"
            >
              <DotsSixVertical size={16} />
            </span>

            <div className="nb-picture-toolbar__group">
              <button
                type="button"
                className={cx('nb-picture-toolbar__btn', align === 'left' && 'is-active')}
                title="Align left"
                onClick={() => updateAttributes({ align: 'left' })}
              >
                <TextAlignLeft size={15} />
              </button>
              <button
                type="button"
                className={cx('nb-picture-toolbar__btn', align === 'center' && 'is-active')}
                title="Align center"
                onClick={() => updateAttributes({ align: 'center' })}
              >
                <TextAlignCenter size={15} />
              </button>
              <button
                type="button"
                className={cx('nb-picture-toolbar__btn', align === 'right' && 'is-active')}
                title="Align right"
                onClick={() => updateAttributes({ align: 'right' })}
              >
                <TextAlignRight size={15} />
              </button>
            </div>

            <div className="nb-picture-toolbar__group">
              {(['25%', '50%', '75%', '100%'] as const).map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={cx('nb-picture-toolbar__btn', 'nb-picture-toolbar__btn--text', width === pct && 'is-active')}
                  title={`Width ${pct}`}
                  onClick={() => updateAttributes({ width: pct })}
                >
                  {pct}
                </button>
              ))}
            </div>

            <div className="nb-picture-toolbar__group" style={{ position: 'relative' }}>
              <button
                type="button"
                className={cx('nb-picture-toolbar__btn', aspectRatio && 'is-active')}
                title="Crop / Aspect ratio"
                onClick={() => setShowCropMenu((prev) => !prev)}
              >
                <Crop size={15} />
              </button>
              {showCropMenu && (
                <div className="nb-picture-crop-menu">
                  <button
                    type="button"
                    className={cx('nb-crop-option', !aspectRatio && 'is-active')}
                    onClick={() => {
                      updateAttributes({ aspectRatio: null, objectFit: 'contain' });
                      setShowCropMenu(false);
                    }}
                  >
                    Auto (Original)
                  </button>
                  <button
                    type="button"
                    className={cx('nb-crop-option', aspectRatio === '1/1' && 'is-active')}
                    onClick={() => {
                      updateAttributes({ aspectRatio: '1/1', objectFit: 'cover' });
                      setShowCropMenu(false);
                    }}
                  >
                    1:1 Square
                  </button>
                  <button
                    type="button"
                    className={cx('nb-crop-option', aspectRatio === '4/3' && 'is-active')}
                    onClick={() => {
                      updateAttributes({ aspectRatio: '4/3', objectFit: 'cover' });
                      setShowCropMenu(false);
                    }}
                  >
                    4:3 Standard
                  </button>
                  <button
                    type="button"
                    className={cx('nb-crop-option', aspectRatio === '16/9' && 'is-active')}
                    onClick={() => {
                      updateAttributes({ aspectRatio: '16/9', objectFit: 'cover' });
                      setShowCropMenu(false);
                    }}
                  >
                    16:9 Widescreen
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className="nb-picture-toolbar__btn nb-picture-toolbar__btn--danger"
              title="Delete picture"
              onClick={deleteNode}
            >
              <Trash size={15} />
            </button>
          </div>
        )}

        {broken ? (
          <span className="nb-picture__broken" contentEditable={false}>
            <ImageBroken aria-hidden="true" /> This picture isn’t available any more.
          </span>
        ) : (
          <div
            className="nb-picture-media"
            style={aspectRatio ? { aspectRatio, overflow: 'hidden' } : undefined}
          >
            <img
              src={noteFileHref(upload)}
              alt={alt}
              draggable={false}
              onError={() => setBroken(true)}
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                height: aspectRatio ? '100%' : 'auto',
                objectFit: (aspectRatio ? (objectFit as 'contain' | 'cover' | undefined) : undefined) || 'contain',
                display: 'block',
              }}
            />
          </div>
        )}

        {isEditable && !broken && (
          <div
            className="nb-picture-resize-handle"
            title="Drag to resize"
            contentEditable={false}
            onMouseDown={handleResizeStart}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const NotePicture = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    upload: { default: null },
    alt: { default: '' },
    width: { default: '100%' },
    align: { default: 'center' },
    aspectRatio: { default: null },
    objectFit: { default: 'contain' },
  }),
  parseHTML: () => [
    {
      tag: 'img[data-upload]',
      getAttrs: (el) => ({
        upload: (el as HTMLElement).getAttribute('data-upload'),
        alt: (el as HTMLElement).getAttribute('alt') ?? '',
        width: (el as HTMLElement).getAttribute('data-width') ?? '100%',
        align: (el as HTMLElement).getAttribute('data-align') ?? 'center',
        aspectRatio: (el as HTMLElement).getAttribute('data-aspect-ratio') || null,
        objectFit: (el as HTMLElement).getAttribute('data-object-fit') ?? 'contain',
      }),
    },
  ],
  renderHTML: ({ node }) => [
    'img',
    {
      'data-upload': node.attrs.upload,
      alt: node.attrs.alt,
      'data-width': node.attrs.width,
      'data-align': node.attrs.align,
      'data-aspect-ratio': node.attrs.aspectRatio,
      'data-object-fit': node.attrs.objectFit,
      src: noteFileHref(String(node.attrs.upload)),
    },
  ],
  renderText: ({ node }) => String(node.attrs.alt ?? ''),
  addNodeView: () => ReactNodeViewRenderer(PictureView),
  addCommands() {
    return {
      insertNotePicture:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

function FileView({ node, deleteNode, editor, selected }: ReactNodeViewProps) {
  const upload = String(node.attrs.upload ?? '');
  const name = String(node.attrs.name ?? 'File');
  const size = Number(node.attrs.size ?? 0);
  const isEditable = editor.isEditable;
  return (
    <NodeViewWrapper className={cx('nb-file', selected && 'is-selected')}>
      {isEditable && (
        <span className="nb-file__drag" data-drag-handle="" title="Drag to move">
          <DotsSixVertical size={16} aria-hidden="true" />
        </span>
      )}
      <span className="nb-file__icon" aria-hidden="true">
        <FileIcon />
      </span>
      <span className="nb-file__text">
        <span className="nb-file__name">{name}</span>
        {size ? <span className="nb-file__size">{formatSize(size)}</span> : null}
      </span>
      <div className="nb-file__actions" contentEditable={false}>
        <Button size="sm" variant="ghost" leadingIcon={DownloadSimple} href={noteFileHref(upload, true)} external={false}>
          Download
        </Button>
        {isEditable && (
          <Button size="sm" variant="ghost" leadingIcon={Trash} onClick={deleteNode} aria-label="Delete file">
            Delete
          </Button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const NoteFile = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ upload: { default: null }, name: { default: '' }, size: { default: 0 } }),
  parseHTML: () => [{ tag: 'div[data-attachment]' }],
  renderHTML: ({ node }) => ['div', { 'data-attachment': node.attrs.upload }, String(node.attrs.name)],
  renderText: ({ node }) => String(node.attrs.name ?? ''),
  addNodeView: () => ReactNodeViewRenderer(FileView),
  addCommands() {
    return {
      insertNoteFile:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
