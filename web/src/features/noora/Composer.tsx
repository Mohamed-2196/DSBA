import { useLayoutEffect, type RefObject } from 'react';
import { ArrowUp, Exam, NotePencil, Paperclip, X } from '@phosphor-icons/react';
import { IconButton, Tooltip, cx } from '../../ui';
import { FileChip } from './Attachment';
import type { Attachment } from './files';

const TALLEST = 132; // px: the box grows with what is typed, up to about five lines

/** "Include my note": the open note goes to her AI with the next question, only when the student ticks it. */
export interface NoteChoice {
  title: string;
  checked: boolean;
  /** longer than her AI reads: only its first part goes */
  long: boolean;
  onChange: (checked: boolean) => void;
}

/** A past paper's question her AI reads with each question (IDEA-4), until the student takes it off. */
export interface PaperChoice {
  title: string;
  page: number;
  question: string;
  onRemove: () => void;
}

export interface ComposerProps {
  /** the text box (ChatPanel focuses it when the chat opens) */
  inputRef: RefObject<HTMLTextAreaElement>;
  draft: string;
  onDraft: (text: string) => void;
  /** what is attached */
  files: Attachment[];
  /** a line about anything that could not be attached */
  note: string | null;
  /** the open note, offered to her AI (null: no note open, or her AI is off) */
  noteChoice?: NoteChoice | null;
  /** the paper's question asked about from the file viewer (null: none, or her AI is off) */
  paperChoice?: PaperChoice | null;
  /** she is still answering: Send waits */
  busy: boolean;
  /** files from the picker or the clipboard */
  onAttach: (files: FileList | null) => void;
  /** take one out of the tray */
  onRemove: (file: Attachment) => void;
  onSend: () => void;
}

/**
 * Where the student writes: one slim field with the text box, what is attached, and a row of small controls under
 * it (attach, "Include my note", Send). A paper's question being asked about sits above the field.
 * Controlled by ChatPanel, which also takes files that are dropped on the chat.
 */
export function Composer({ inputRef, draft, onDraft, files, note, noteChoice = null, paperChoice = null, busy, onAttach, onRemove, onSend }: ComposerProps) {
  const ready = !busy && (draft.trim().length > 0 || files.length > 0);

  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = 'auto';
    // scrollHeight leaves the border out; the box's height (border-box) includes it.
    box.style.height = `${Math.min(box.scrollHeight + box.offsetHeight - box.clientHeight, TALLEST)}px`;
  }, [draft, inputRef]);

  const remove = (file: Attachment) => (
    <button type="button" className="nc-tray__remove" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file)}>
      <X weight="bold" aria-hidden="true" />
    </button>
  );

  return (
    <div className="nc-composer">
      {paperChoice ? (
        <div className="nc-context" data-hub="noora-paper">
          <Exam aria-hidden="true" weight="duotone" className="nc-context__icon" />
          <span className="nc-context__text">
            <span className="nc-context__title">
              Question {paperChoice.question}, page {paperChoice.page}
            </span>
            <span className="nc-context__sub">
              “{paperChoice.title}”. That page and the examiners’ report go to Claude with your questions.
            </span>
          </span>
          <IconButton label="Stop asking about this paper" icon={X} size="sm" onClick={paperChoice.onRemove} data-hub="noora-paper-remove" />
        </div>
      ) : null}

      <form
        className="nc-field"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        {files.length || note ? (
          <div className="nc-tray" data-hub="noora-tray">
            {files.map((file) =>
              file.kind === 'image' && file.url ? (
                <span key={file.id} className="nc-tray__shot">
                  <img src={file.url} alt={file.name} />
                  {remove(file)}
                </span>
              ) : (
                <FileChip key={file.id} file={file}>
                  {remove(file)}
                </FileChip>
              ),
            )}
            {note ? (
              <p className="nc-tray__note" role="status">
                {note}
              </p>
            ) : null}
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          className="nc-input"
          rows={1}
          value={draft}
          placeholder="Ask about a module, a topic or an exam"
          aria-label="Message Mini Noora"
          dir="auto"
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter makes a new line. (Not while an input method is still composing.)
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            onSend();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.files;
            if (!pasted.length) return;
            e.preventDefault();
            onAttach(pasted);
          }}
          data-hub="noora-input"
        />
        <div className="nc-tools">
          {/* A label around the real file input: a click, the keyboard and the tooling's setInputFiles all reach it. */}
          <Tooltip label="Attach a photo or file" side="top" describe={false}>
            <label className="nc-tool nc-tool--icon" data-hub="noora-attach">
              <input
                type="file"
                multiple
                className="visually-hidden"
                aria-label="Attach a photo or file"
                onChange={(e) => {
                  onAttach(e.target.files);
                  e.target.value = ''; // so the same file can be picked again
                }}
              />
              <Paperclip aria-hidden="true" />
            </label>
          </Tooltip>
          {noteChoice ? (
            <label className={cx('nc-tool', 'nc-toggle', noteChoice.checked && 'is-on')} title={`“${noteChoice.title}”`} data-hub="noora-include-note">
              <input type="checkbox" className="visually-hidden" checked={noteChoice.checked} onChange={(e) => noteChoice.onChange(e.target.checked)} />
              <NotePencil aria-hidden="true" weight={noteChoice.checked ? 'fill' : 'regular'} />
              <span>Include my note</span>
            </label>
          ) : null}
          <IconButton type="submit" label="Send" icon={<ArrowUp weight="bold" />} variant="primary" size="sm" className="nc-send" disabled={!ready} data-hub="noora-send" />
        </div>
      </form>
      {noteChoice?.checked ? (
        <p className="nc-included" role="status">
          “{noteChoice.title}” {noteChoice.long ? 'goes to Claude with this question: its first 20,000 characters.' : 'goes to Claude with this question only.'}
        </p>
      ) : null}
    </div>
  );
}
