import { useLayoutEffect, type RefObject } from 'react';
import { NotePencil, PaperPlaneRight, Paperclip, X } from '@phosphor-icons/react';
import { IconButton, Tooltip } from '../../ui';
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
  /** she is still answering: Send waits */
  busy: boolean;
  /** files from the picker or the clipboard */
  onAttach: (files: FileList | null) => void;
  /** take one out of the tray */
  onRemove: (file: Attachment) => void;
  onSend: () => void;
  /** the text box took focus (the phone sheet goes to full height, above the keyboard) */
  onFocus?: () => void;
}

/**
 * Where the student writes: a tray of what is attached, the paperclip, the text box and Send.
 * Controlled by ChatPanel, which also takes files that are dropped on the chat.
 */
export function Composer({ inputRef, draft, onDraft, files, note, noteChoice = null, busy, onAttach, onRemove, onSend, onFocus }: ComposerProps) {
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

      {noteChoice ? (
        <label className="nc-include" data-hub="noora-include-note">
          <input type="checkbox" checked={noteChoice.checked} onChange={(e) => noteChoice.onChange(e.target.checked)} />
          <NotePencil aria-hidden="true" weight="duotone" />
          <span className="nc-include__text">
            Include my note <span className="nc-include__title">“{noteChoice.title}”</span>
            {noteChoice.checked ? (
              <span className="nc-include__hint">{noteChoice.long ? 'Its first 20,000 characters go to Claude with this question.' : 'It goes to Claude with this question only.'}</span>
            ) : null}
          </span>
        </label>
      ) : null}

      <form
        className="nc-compose"
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      >
        {/* A label around the real file input: a click, the keyboard and the tooling's setInputFiles all reach it. */}
        <Tooltip label="Attach a photo or file" side="top" describe={false}>
          <label className="nc-attach" data-hub="noora-attach">
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
        <textarea
          ref={inputRef}
          className="nc-input"
          rows={1}
          value={draft}
          placeholder="Ask about a module, a topic or an exam…"
          aria-label="Message Mini Noora"
          dir="auto"
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => onDraft(e.target.value)}
          onFocus={onFocus}
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
        <IconButton type="submit" label="Send" icon={<PaperPlaneRight weight="fill" />} variant="primary" className="nc-send" disabled={!ready} data-hub="noora-send" />
      </form>
    </div>
  );
}
