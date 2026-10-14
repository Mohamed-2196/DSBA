import { useLayoutEffect, type RefObject } from 'react';
import { ArrowUp, Browser, Exam, NotePencil, Paperclip, Plus, Stop, X, type Icon } from '@phosphor-icons/react';
import { IconButton, Tooltip, cx } from '../../ui';
import { FileChip } from './Attachment';
import type { Attachment } from './files';

const TALLEST = 132; // px: the box grows with what is typed, up to about five lines
export const QUESTION_MAX = 2000; // characters of a question (the API's limit)
const COUNT_FROM = 1600; // characters typed before the count shows

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

/** The page the student is on, which her AI is told about unless the student takes it off. */
export interface PageChoice {
  label: string;
  shared: boolean;
  onChange: (shared: boolean) => void;
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
  /** the page, offered to her AI (null: her AI is off) */
  pageChoice?: PageChoice | null;
  /** the open note, offered to her AI (null: no note open, or her AI is off) */
  noteChoice?: NoteChoice | null;
  /** the paper's question asked about from the file viewer (null: none, or her AI is off) */
  paperChoice?: PaperChoice | null;
  /** she is still answering: Send becomes Stop */
  busy: boolean;
  /** the last question is being edited (sending replaces it) */
  editing: boolean;
  /** files from the picker or the clipboard */
  onAttach: (files: FileList | null) => void;
  /** take one out of the tray */
  onRemove: (file: Attachment) => void;
  onSend: () => void;
  /** stop the answer on its way */
  onStop: () => void;
  /** up arrow in an empty box: edit the last question */
  onEditLast: () => void;
  onCancelEdit: () => void;
}

interface SeenProps {
  icon: Icon;
  label: string;
  title: string;
  removeLabel: string;
  onRemove: () => void;
  hub: string;
  removeHub?: string;
}

/** One thing her AI can see, with a button to take it off. */
function Seen({ icon: SeenIcon, label, title, removeLabel, onRemove, hub, removeHub }: SeenProps) {
  return (
    <li className="nc-see" data-hub={hub} title={title}>
      <SeenIcon className="nc-see__icon" aria-hidden="true" weight="duotone" />
      <span className="nc-see__label">{label}</span>
      <button type="button" className="nc-see__remove" aria-label={removeLabel} onClick={onRemove} data-hub={removeHub}>
        <X weight="bold" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Where the student writes: what her AI can see (chips, each removable), one slim field with the text box and what
 * is attached, and a row of small controls under it (attach, "Include my note", the count, Send or Stop).
 * Enter sends, Shift+Enter makes a new line, the up arrow in an empty box edits the last question, Esc closes the
 * chat (or stops editing). Controlled by ChatPanel, which also takes files that are dropped on the chat.
 */
export function Composer(props: ComposerProps) {
  const { inputRef, draft, onDraft, files, note, pageChoice = null, noteChoice = null, paperChoice = null, busy, editing } = props;
  const { onAttach, onRemove, onSend, onStop, onEditLast, onCancelEdit } = props;
  const length = draft.trim().length;
  const over = length > QUESTION_MAX;
  const ready = !busy && !over && (length > 0 || files.length > 0);

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

  const sees = Boolean(pageChoice || paperChoice || noteChoice?.checked);

  return (
    <div className="nc-composer">
      {sees ? (
        <ul role="list" className="nc-sees" aria-label="What Mini Noora can see">
          {pageChoice?.shared ? (
            <Seen
              icon={Browser}
              label={pageChoice.label}
              title="This page goes to Claude with your questions."
              removeLabel="Don’t share this page"
              onRemove={() => pageChoice.onChange(false)}
              hub="noora-see-page"
            />
          ) : null}
          {paperChoice ? (
            <Seen
              icon={Exam}
              label={`Question ${paperChoice.question}, page ${paperChoice.page}`}
              title={`“${paperChoice.title}”. That page and the examiners’ report go to Claude with your questions.`}
              removeLabel="Stop asking about this paper"
              onRemove={paperChoice.onRemove}
              hub="noora-paper"
              removeHub="noora-paper-remove"
            />
          ) : null}
          {noteChoice?.checked ? (
            <Seen
              icon={NotePencil}
              label={noteChoice.long ? `${noteChoice.title} (first 20,000 characters)` : noteChoice.title}
              title={`“${noteChoice.title}” goes to Claude with this question only.`}
              removeLabel="Don’t include my note"
              onRemove={() => noteChoice.onChange(false)}
              hub="noora-see-note"
            />
          ) : null}
          {pageChoice && !pageChoice.shared ? (
            <li>
              <button type="button" className="nc-see nc-see--off" onClick={() => pageChoice.onChange(true)} data-hub="noora-see-page-add">
                <Plus className="nc-see__icon" aria-hidden="true" weight="bold" />
                <span className="nc-see__label">Share this page</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {editing ? (
        <p className="nc-editing" data-hub="noora-editing">
          <span>Editing your last question</span>
          <button type="button" className="nc-editing__cancel" onClick={onCancelEdit}>
            Cancel
          </button>
        </p>
      ) : null}

      <form
        className={cx('nc-field', over && 'is-over')}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) onStop();
          else if (ready) onSend();
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
          aria-describedby={length >= COUNT_FROM ? 'nc-count' : undefined}
          aria-invalid={over || undefined}
          dir="auto"
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return; // an input method is still composing
            if (e.key === 'Escape' && editing) {
              e.preventDefault();
              e.stopPropagation(); // stop editing, not close the chat
              onCancelEdit();
              return;
            }
            if (e.key === 'ArrowUp' && !draft && !busy && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              onEditLast();
              return;
            }
            // Enter sends; Shift+Enter makes a new line.
            if (e.key !== 'Enter' || e.shiftKey) return;
            e.preventDefault();
            if (ready) onSend();
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
          <span className="nc-tools__end">
            {length >= COUNT_FROM ? (
              <span id="nc-count" className={cx('nc-count', 'u-tabular', over && 'is-over')} data-hub="noora-count">
                {over ? `${(length - QUESTION_MAX).toLocaleString('en-GB')} characters over the limit` : `${length.toLocaleString('en-GB')} / ${QUESTION_MAX.toLocaleString('en-GB')}`}
              </span>
            ) : null}
            {busy ? (
              <IconButton type="submit" label="Stop answering" icon={<Stop weight="fill" />} variant="secondary" size="sm" className="nc-send" tooltip tooltipSide="top" data-hub="noora-stop" />
            ) : (
              <IconButton type="submit" label="Send" icon={<ArrowUp weight="bold" />} variant="primary" size="sm" className="nc-send" disabled={!ready} data-hub="noora-send" />
            )}
          </span>
        </div>
      </form>
    </div>
  );
}
