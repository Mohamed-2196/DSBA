// The note editor's own nodes: formulas set with the hub's KaTeX ($…$ in a line, $$…$$ on their own), and the
// note's pictures and files (uploads served only to their owner: /notes/files/{id}). The API accepts exactly these
// names and small scalar attributes (api/app/services/note_doc.py). Every block takes whole lines of the paper, so
// the text after it stays on the ruled lines.
import { DownloadSimple, File as FileIcon, FileCsv, FileDoc, FileImage, FilePdf, FilePpt, FileXls, Trash, type Icon } from '@phosphor-icons/react';
import { InputRule, Node, mergeAttributes, nodeInputRule, type CommandProps } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { fileExtension, formatSize } from '../../../api/uploads';
import { TeX, cx } from '../../../ui';
import { noteFileHref } from '../api';
import { LINE } from '../surface/layout';
import { BlockBar, BlockBarButton } from './BlockBar';
import { PictureView } from './PictureView';
import { useBlockMove } from './useBlockMove';

export interface NewPicture {
  upload: string;
  alt: string;
  /** width over height of the picture */
  ratio: number;
  /** its share of the text's width */
  width: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteMath: {
      /** a formula in the line, opened for typing */
      insertInlineMath: (latex?: string) => ReturnType;
      /** a formula on its own line, opened for typing */
      insertBlockMath: (latex?: string) => ReturnType;
    };
    noteFiles: {
      insertNotePicture: (attrs: NewPicture, at?: number | null) => ReturnType;
      insertNoteFile: (attrs: { upload: string; name: string; size: number }, at?: number | null) => ReturnType;
    };
  }
}

/**
 * Puts a picture or a file into the text (where it was dropped, or at the cursor, splitting the line it is in), with
 * the cursor after it on a line of its own: typing goes on below the picture and never replaces it.
 */
function insertBlock(name: string, attrs: Record<string, unknown>, at: number | null | undefined) {
  return ({ chain, state }: CommandProps): boolean => {
    const start = typeof at === 'number' ? at : state.selection.from;
    return chain()
      .insertContentAt(typeof at === 'number' ? at : { from: state.selection.from, to: state.selection.to }, { type: name, attrs })
      .command(({ tr }) => {
        let found = -1;
        tr.doc.nodesBetween(Math.max(0, tr.mapping.map(start, -1) - 2), tr.doc.content.size, (node, pos) => {
          if (found >= 0) return false;
          if (node.type.name === name && node.attrs.upload === attrs.upload) {
            found = pos;
            return false;
          }
          return true;
        });
        const inserted = found >= 0 ? tr.doc.nodeAt(found) : null;
        if (!inserted) return true;
        const after = found + inserted.nodeSize;
        const next = tr.doc.nodeAt(after);
        if (!next?.isTextblock) tr.insert(after, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
        return true;
      })
      .run();
  };
}

/** The height a block takes: whole lines of the paper. */
const toLines = (units: number): number => Math.max(1, Math.ceil(units / LINE)) * LINE;

/** A formula: set by KaTeX; pressing it (while writing) opens its LaTeX for editing. */
function MathView({ node, updateAttributes, deleteNode, editor, selected }: ReactNodeViewProps) {
  const display = node.type.name === 'blockMath';
  const latex = String(node.attrs.latex ?? '');
  const fresh = !!node.attrs.fresh;
  const [editing, setEditing] = useState(fresh && editor.isEditable);
  const [text, setText] = useState(latex);
  const input = useRef<HTMLTextAreaElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (fresh) updateAttributes({ fresh: null });
    // Only on the first render: `fresh` marks a formula just inserted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A formula on its own line takes whole lines of the paper.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!display || !el) return undefined;
    const measure = () => setHeight(toLines(el.offsetHeight + 8));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [display]);

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

  const body = editing ? (
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
  );

  if (!display) {
    return (
      <NodeViewWrapper as="span" className={cx('nb-math', selected && 'is-selected')}>
        {body}
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper as="div" className={cx('nb-math nb-math--block', selected && 'is-selected')} style={height ? { height } : undefined}>
      <div ref={inner} className="nb-math__inner">
        {body}
      </div>
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

export const NotePicture = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  // moved by its own drag (useBlockMove), with a finger or a pen as well as a mouse
  draggable: false,
  addAttributes: () => ({
    upload: { default: null },
    alt: { default: '' },
    caption: { default: '' },
    width: { default: 1 },
    x: { default: 0.5 },
    ratio: { default: null },
    rotate: { default: 0 },
    cropX: { default: 0 },
    cropY: { default: 0 },
    cropW: { default: 1 },
    cropH: { default: 1 },
  }),
  parseHTML: () => [{ tag: 'img[data-upload]', getAttrs: (el) => ({ upload: (el as HTMLElement).getAttribute('data-upload'), alt: (el as HTMLElement).getAttribute('alt') ?? '' }) }],
  renderHTML: ({ node }) => ['img', { 'data-upload': node.attrs.upload, alt: node.attrs.alt, src: noteFileHref(String(node.attrs.upload)) }],
  renderText: ({ node }) => [node.attrs.caption, node.attrs.alt].filter((t) => typeof t === 'string' && t).join(' '),
  addNodeView: () => ReactNodeViewRenderer(PictureView),
  addCommands() {
    return {
      insertNotePicture: (attrs, at) => insertBlock(this.name, { ...attrs }, at),
    };
  },
});

const FILE_ICONS: Record<string, Icon> = {
  pdf: FilePdf,
  doc: FileDoc,
  docx: FileDoc,
  xls: FileXls,
  xlsx: FileXls,
  csv: FileCsv,
  ppt: FilePpt,
  pptx: FilePpt,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  webp: FileImage,
  gif: FileImage,
};

/** A file in a note: its name and size, opened in a new tab or downloaded; selected, it can be dragged or deleted. */
function FileView({ node, deleteNode, editor, selected, getPos }: ReactNodeViewProps) {
  const upload = String(node.attrs.upload ?? '');
  const name = String(node.attrs.name ?? 'File');
  const size = Number(node.attrs.size ?? 0);
  const editable = editor.isEditable;
  const ext = fileExtension(name);
  const Glyph = (ext && FILE_ICONS[ext]) || FileIcon;
  const { move, onPointerDown } = useBlockMove({ editor, getPos, enabled: editable, selected });
  const select = (e: MouseEvent) => {
    const pos = getPos();
    if (!editable || selected || pos === undefined || (e.target instanceof Element && e.target.closest('a'))) return;
    editor.chain().setNodeSelection(pos).focus(undefined, { scrollIntoView: false }).run();
  };
  return (
    <NodeViewWrapper className={cx('nb-file', selected && 'is-selected', move && 'is-moving')} data-hub="note-file">
      <div className="nb-file__card" contentEditable={false} onPointerDown={onPointerDown} onClick={select} style={move ? { transform: `translate(${move.dx}px, ${move.dy}px)` } : undefined}>
        <span className="nb-file__icon" aria-hidden="true">
          <Glyph />
        </span>
        <span className="nb-file__text">
          <a className="nb-file__name" href={noteFileHref(upload)} target="_blank" rel="noopener noreferrer" title={`Open ${name}`}>
            {name}
          </a>
          <span className="nb-file__size">{[ext?.toUpperCase(), formatSize(size)].filter(Boolean).join(' · ')}</span>
        </span>
        <a className="nb-file__download" href={noteFileHref(upload, true)} aria-label={`Download ${name}`} title="Download">
          <DownloadSimple aria-hidden="true" />
        </a>
        {editable && selected && !move ? (
          <BlockBar label="File">
            <BlockBarButton icon={Trash} label="Delete file" danger onClick={deleteNode} />
          </BlockBar>
        ) : null}
      </div>
      {move?.line ? createPortal(<div className="nb-dropline" style={{ left: move.line.left, top: move.line.top, width: move.line.width }} aria-hidden="true" />, document.body) : null}
    </NodeViewWrapper>
  );
}

export const NoteFile = Node.create({
  name: 'attachment',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: () => ({ upload: { default: null }, name: { default: '' }, size: { default: 0 } }),
  parseHTML: () => [{ tag: 'div[data-attachment]' }],
  renderHTML: ({ node }) => ['div', { 'data-attachment': node.attrs.upload }, String(node.attrs.name)],
  renderText: ({ node }) => String(node.attrs.name ?? ''),
  addNodeView: () => ReactNodeViewRenderer(FileView),
  addCommands() {
    return {
      insertNoteFile: (attrs, at) => insertBlock(this.name, { ...attrs }, at),
    };
  },
});
