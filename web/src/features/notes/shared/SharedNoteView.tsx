// A shared note, read only: its pages as the writer laid them out (the typed text on the paper, the pictures free on
// the pages and the handwriting over them, the column scaled to fit), or its text alone at reading size (phones open
// there). The pictures and files are read from the shared copy, never from the writer's notebook.
import { EditorContent } from '@tiptap/react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SharedNote } from '../../../api/types';
import { InkSheet, type InkStroke } from '../../../lib/ink';
import { useMediaQuery } from '../../../state';
import { SegmentedControl, cx } from '../../../ui';
import type { RichDoc } from '../draft';
import { NoteFilesContext } from '../files';
import { picturesOfDoc } from '../pictures/document';
import { FreePictureView } from '../pictures/FreePictureView';
import { SHEET_WIDTH, TEXT_SIDE, TEXT_TOP, TEXT_WIDTH, layoutSheets, sheetsOf } from '../surface/layout';
import { useNoteText } from '../text/useNoteText';
import { sharedFileHref } from './api';
import '../Notebook.css';

/** Narrower than this, the pages fitted to the screen make typed text too small to read (as the editor). */
const READING_WIDTH = '(max-width: 719px)';
const NONE: readonly InkStroke[] = [];
const noop = () => undefined;

type View = 'pages' | 'text';
const VIEWS: { value: View; label: string }[] = [
  { value: 'pages', label: 'Pages' },
  { value: 'text', label: 'Text' },
];

/** The column's width on screen, as a share of the sheet's (at most its own size). */
function useFit(): [React.RefObject<HTMLDivElement>, number] {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setZoom(Math.min(1, el.clientWidth / SHEET_WIDTH) || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [box, zoom];
}

export function SharedNoteView({ copy }: { copy: SharedNote }) {
  const narrow = useMediaQuery(READING_WIDTH);
  const doc = copy.doc as RichDoc;
  const pictures = picturesOfDoc(doc);
  const onPages = copy.ink.length > 0 || pictures.length > 0;
  const [chosen, setChosen] = useState<View | null>(null);
  const view: View = chosen ?? (narrow ? 'text' : 'pages');
  const editor = useNoteText({
    doc,
    readOnly: true,
    onChange: noop,
    onReady: noop,
    onFiles: noop,
    onUndo: noop,
    onRedo: noop,
  });
  const files = useMemo(() => sharedFileHref(copy.id), [copy.id]);
  const layout = useMemo(() => layoutSheets(sheetsOf([], Math.max(1, copy.sheets))), [copy.sheets]);
  const ink = useMemo(() => new Map(copy.ink.map((p) => [p.sheet, p.strokes as readonly InkStroke[]])), [copy.ink]);
  const [box, zoom] = useFit();
  const paper = layout.sheets;

  return (
    <NoteFilesContext.Provider value={files}>
      <div className="shn-view" data-hub="shared-note-view">
        <div className="shn-view__bar">
          <SegmentedControl label="Show" size="sm" options={VIEWS} value={view} onChange={setChosen} />
          {view === 'text' && onPages ? (
            <p className="shn-view__hint">
              This note has handwriting or pictures on its pages.{' '}
              <button type="button" className="nb-linkbutton" onClick={() => setChosen('pages')}>
                See the pages
              </button>
            </p>
          ) : null}
        </div>
        {view === 'text' ? (
          <div className="nb-reflow shn-view__text" data-hub="shared-note-text">
            {editor ? <EditorContent editor={editor} /> : null}
          </div>
        ) : (
          <div ref={box} className="shn-view__pages">
            <div
              className="shn-view__canvas"
              style={{ width: SHEET_WIDTH * zoom, height: layout.height * zoom }}
              data-hub="shared-note-pages"
            >
              <div
                className={cx('nb-stack', 'shn-view__stack')}
                style={{ width: SHEET_WIDTH, height: layout.height, transform: `scale(${zoom})` }}
              >
                <div
                  className={cx('nb-paper', `nb-paper--${copy.paper}`)}
                  style={{ top: layout.paperTop, height: layout.paperHeight }}
                >
                  {paper.slice(1).map((s, i) => (
                    <span
                      key={s.index}
                      className="nb-paper__break"
                      style={{ top: s.top - layout.paperTop }}
                      aria-hidden="true"
                    >
                      <span>{i + 2}</span>
                    </span>
                  ))}
                  <div className="nb-paper__text" style={{ top: TEXT_TOP, left: TEXT_SIDE, width: TEXT_WIDTH }}>
                    {editor ? <EditorContent editor={editor} /> : null}
                  </div>
                  {paper.map((s) => (
                    <div
                      key={s.index}
                      className="nb-sheet__ink"
                      style={{ top: s.top - layout.paperTop, height: s.height }}
                    >
                      <InkSheet strokes={ink.get(s.index) ?? NONE} width={SHEET_WIDTH} height={s.height} />
                    </div>
                  ))}
                </div>
                {paper.map((s) =>
                  pictures.some((p) => p.sheet === s.index) ? (
                    <div key={s.index} className="shn-view__sheet" style={{ top: s.top, height: s.height }}>
                      {pictures
                        .filter((p) => p.sheet === s.index)
                        .map((p) => (
                          <FreePictureView key={p.id} p={p} />
                        ))}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </NoteFilesContext.Provider>
  );
}
