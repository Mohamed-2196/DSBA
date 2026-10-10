import { useLayoutEffect } from 'react';
import { PaperPlaneRight, Paperclip, X } from '@phosphor-icons/react';
import { IconButton, Tooltip } from '../../ui';
import { FileChip } from './Attachment';

const TALLEST = 132; // px: the box grows with what is typed, up to about five lines

/**
 * Where the student writes: a tray of what is attached, the paperclip, the text box and Send.
 * Controlled by ChatPanel, which also takes files that are dropped on the chat.
 *
 * @param inputRef           the text box (ChatPanel focuses it when the chat opens)
 * @param draft, onDraft     the text, and its setter
 * @param files, note        what is attached, and a line about anything that could not be
 * @param busy               she is still answering: Send waits
 * @param onAttach(fileList) files from the picker or the clipboard
 * @param onRemove(file)     take one out of the tray
 * @param onSend()
 */
export function Composer({ inputRef, draft, onDraft, files, note, busy, onAttach, onRemove, onSend }) {
  const ready = !busy && (draft.trim().length > 0 || files.length > 0);

  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = 'auto';
    // scrollHeight leaves the border out; the box's height (border-box) includes it.
    box.style.height = `${Math.min(box.scrollHeight + box.offsetHeight - box.clientHeight, TALLEST)}px`;
  }, [draft, inputRef]);

  const remove = (file) => (
    <button type="button" className="nc-tray__remove" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file)}>
      <X weight="bold" aria-hidden="true" />
    </button>
  );

  return (
    <div className="nc-composer">
      {files.length || note ? (
        <div className="nc-tray" data-hub="noora-tray">
          {files.map((file) =>
            file.kind === 'image' ? (
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
          placeholder="Ask about a module, or drop a file…"
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
            const pasted = e.clipboardData?.files;
            if (!pasted || !pasted.length) return;
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
