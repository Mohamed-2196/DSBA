// Pictures a student can attach in the composer. This is a prototype: nothing is uploaded and there is no file
// picker. "Attach image" attaches the one sample picture (a photo of a problem-set question) so the whole flow
// (attach, preview, post, thumbnail in the list, picture in the thread) can be shown. The file is in public/demo/forum.
// Posting writes it into the thread body as markdown (see attachmentMarkdown), so it is just a post with a picture.

export const ATTACHMENTS = [
  {
    id: 'reduction-formula',
    src: '/demo/forum/reduction-formula.jpg',
    name: 'reduction-formula.jpg',
    width: 1080,
    height: 503,
    bytes: 160571,
    alt: 'Question 3(a) from the problem set: Iₙ is the integral of cosⁿθ from 0 to π/2. For n ≥ 2, show that Iₙ = ((n−1)/n) Iₙ₋₂, hence find I₂ and I₃, then deduce the value of Iₙ for n ≥ 2.',
  },
];

/** What the "Attach image" button attaches. */
export const SAMPLE_ATTACHMENT = ATTACHMENTS[0];

/** The attachment with this id (from ?attach=<id> or a saved draft), or null. */
export function getAttachment(id) {
  return ATTACHMENTS.find((a) => a.id === id) || null;
}

/** The markdown line that puts an attachment at the top of a post. */
export function attachmentMarkdown(attachment) {
  return `![${attachment.alt}](${attachment.src})`;
}

/** '157 KB' */
export function attachmentSize(attachment) {
  return `${Math.max(1, Math.round(attachment.bytes / 1024))} KB`;
}
