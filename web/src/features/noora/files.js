// Attachments in the chat. Nothing is uploaded: a file never leaves the browser. A picture is shown
// through an object URL, which is released once the picture is no longer needed.
import { File, FilePdf, FileText } from '@phosphor-icons/react';

const MAX_FILES = 4;
const MAX_BYTES = 10 * 1024 * 1024;

const PICTURE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const WRITTEN = /\.(docx?|odt|rtf|txt|md|csv|r|py|sql|ipynb|json)$/i;

let made = 0;
const lent = new Set(); // object URLs handed out and not yet released

/** A File (from the picker, a drop or the clipboard) as the chat keeps it: { id, kind, name, size, url }. */
function toAttachment(file) {
  const kind = String(file.type).startsWith('image/') || PICTURE.test(file.name) ? 'image' : 'file';
  const url = kind === 'image' ? URL.createObjectURL(file) : null;
  if (url) lent.add(url);
  made += 1;
  return {
    id: `file-${made}`,
    kind, // 'image' | 'file'
    name: file.name || (kind === 'image' ? 'Pasted image' : 'File'),
    size: file.size,
    url,
  };
}

/** Let go of one attachment's object URL (it was taken out of the tray before being sent). */
export function release(attachment) {
  if (!attachment.url) return;
  URL.revokeObjectURL(attachment.url);
  lent.delete(attachment.url);
}

/** Let go of every object URL still out (the chat is going away, and its pictures with it). */
export function releaseAll() {
  lent.forEach((url) => URL.revokeObjectURL(url));
  lent.clear();
}

/**
 * Add files to what is already attached, within the limits (four at a time, 10 MB each).
 * @returns {{ list: Attachment[], note: string|null }}  note: a line about anything left out
 */
export function addFiles(attached, files) {
  const list = [...attached];
  const tooBig = [];
  let tooMany = false;
  for (const file of files) {
    if (file.size > MAX_BYTES) tooBig.push(file.name || 'One file');
    else if (list.length >= MAX_FILES) tooMany = true;
    else list.push(toAttachment(file));
  }
  let note = null;
  if (tooBig.length) note = `${tooBig.length === 1 ? `${tooBig[0]} is` : `${tooBig.length} files are`} over 10 MB, so I left ${tooBig.length === 1 ? 'it' : 'them'} out.`;
  else if (tooMany) note = `I can take ${MAX_FILES} files at a time, so I kept the first ${MAX_FILES}.`;
  return { list, note };
}

/** '157 KB', '2.4 MB' */
export function sizeLabel(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The icon for a file, by its extension: a PDF, something written, or any other file. */
export function fileIcon(name) {
  if (/\.pdf$/i.test(name)) return FilePdf;
  return WRITTEN.test(name) ? FileText : File;
}
