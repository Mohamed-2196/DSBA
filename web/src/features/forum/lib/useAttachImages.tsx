// Attaching pictures to a post, the one wiring for the thread composer, the reply composer and the edit form (code
// quality review CQ-5): a hidden file input, uploads with progress (lib/uploads.ts), the picture's markdown line put
// in after the line the cursor is on, and its card taken away again when the line leaves the text.
//
//   const images = useAttachImages({ text: body, setText: (f) => setBody(f), textareaRef, gate });
//   {images.input}
//   <MarkdownEditor onAttachImage={images.pick} onImageFiles={images.addFiles} textareaRef={textareaRef} … />
//   <AttachmentList uploads={images.cards} onRetry={images.retry} onRemove={images.remove} />
import { useCallback, useRef, type ReactNode, type RefObject } from 'react';
import { imageMarkdown, insertBlock, removeImageLines } from './editing';
import { IMAGE_ACCEPT, useImageUploads, type ImageUpload } from './uploads';

export interface AttachImagesOptions {
  /** the text the pictures go into */
  text: string;
  /** change the text; functional, so a picture that finishes while someone types lands in the latest text */
  setText: (update: (text: string) => string) => void;
  /** the textarea: a finished picture goes in after the line its cursor is on (at the end without one) */
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** asked before picking or taking files (a guest signs in first): false stops there */
  gate?: () => boolean;
}

export interface AttachImages {
  /** the hidden file input: render it once, anywhere in the form */
  input: ReactNode;
  /** open the file picker */
  pick: () => void;
  /** upload pasted or dropped pictures */
  addFiles: (files: File[]) => void;
  /** the cards to show: uploads in progress, problems, and finished pictures still in the text */
  cards: ImageUpload[];
  retry: (key: string) => void;
  /** cancel an upload, or take a finished picture out of the text */
  remove: (key: string) => void;
  /** forget every upload (after posting) */
  reset: () => void;
  /** a picture is still uploading */
  busy: boolean;
}

export function useAttachImages({ text, setText, textareaRef, gate }: AttachImagesOptions): AttachImages {
  const fileInput = useRef<HTMLInputElement>(null);
  const uploads = useImageUploads((img) => {
    setText((t) => {
      const at = textareaRef.current ? textareaRef.current.selectionEnd : t.length;
      return insertBlock(t, at, imageMarkdown(img.alt, img.mediaUrl)).text;
    });
  });
  const { start, items, retry, reset, busy } = uploads;
  const removeUpload = uploads.remove;

  const pick = useCallback(() => {
    if (gate && !gate()) return;
    fileInput.current?.click();
  }, [gate]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length || (gate && !gate())) return;
      for (const f of files) start(f);
    },
    [gate, start],
  );

  const remove = useCallback(
    (key: string) => {
      const url = items.find((u) => u.key === key)?.mediaUrl;
      if (url) setText((t) => removeImageLines(t, url));
      removeUpload(key);
    },
    [items, setText, removeUpload],
  );

  const input = (
    <input
      ref={fileInput}
      type="file"
      accept={IMAGE_ACCEPT}
      multiple
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ''; // picking the same file again still fires onChange
        for (const f of files) start(f);
      }}
    />
  );

  // A card is only kept while its picture is still in the text (deleting the line removes the card).
  const cards = items.filter((u) => u.phase !== 'done' || (u.mediaUrl !== null && text.includes(u.mediaUrl)));

  return { input, pick, addFiles, cards, retry, remove, reset, busy };
}
