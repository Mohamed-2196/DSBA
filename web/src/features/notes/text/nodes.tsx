// The note editor's own nodes: formulas set with the hub's KaTeX ($…$ in a line, $$…$$ on their own), and the
// note's pictures and files (uploads served only to their owner: /notes/files/{id}). The API accepts exactly these
// names and attributes (api/app/services/note_doc.py).
import { DownloadSimple, File as FileIcon, ImageBroken } from '@phosphor-icons/react';
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
      insertNotePicture: (attrs: { upload: string; alt: string }) => ReturnType;
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

function PictureView({ node, selected }: ReactNodeViewProps) {
  const upload = String(node.attrs.upload ?? '');
  const alt = String(node.attrs.alt ?? '');
  const [broken, setBroken] = useState(false);
  return (
    <NodeViewWrapper className={cx('nb-picture', selected && 'is-selected')} data-drag-handle="">
      {broken ? (
        <span className="nb-picture__broken" contentEditable={false}>
          <ImageBroken aria-hidden="true" /> This picture isn’t available any more.
        </span>
      ) : (
        <img src={noteFileHref(upload)} alt={alt} draggable={false} onError={() => setBroken(true)} referrerPolicy="no-referrer" />
      )}
    </NodeViewWrapper>
  );
}

export const NotePicture = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ upload: { default: null }, alt: { default: '' } }),
  parseHTML: () => [{ tag: 'img[data-upload]', getAttrs: (el) => ({ upload: (el as HTMLElement).getAttribute('data-upload'), alt: (el as HTMLElement).getAttribute('alt') ?? '' }) }],
  renderHTML: ({ node }) => ['img', { 'data-upload': node.attrs.upload, alt: node.attrs.alt, src: noteFileHref(String(node.attrs.upload)) }],
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

function FileView({ node, selected }: ReactNodeViewProps) {
  const upload = String(node.attrs.upload ?? '');
  const name = String(node.attrs.name ?? 'File');
  const size = Number(node.attrs.size ?? 0);
  return (
    <NodeViewWrapper className={cx('nb-file', selected && 'is-selected')} data-drag-handle="">
      <span className="nb-file__icon" aria-hidden="true">
        <FileIcon />
      </span>
      <span className="nb-file__text">
        <span className="nb-file__name">{name}</span>
        {size ? <span className="nb-file__size">{formatSize(size)}</span> : null}
      </span>
      <Button size="sm" variant="ghost" leadingIcon={DownloadSimple} href={noteFileHref(upload, true)} external={false} contentEditable={false}>
        Download
      </Button>
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
