// A PDF's page drawn for paper, as a picture (PrintNote and PrintModule).
import type { LoadedPdf } from '../pdf';

/** A PDF page is drawn this many pixels wide for paper (about 190 dots an inch on A4). */
const PRINT_WIDTH = 1600;

/** One PDF page drawn for paper, as a picture's address (revoke it when done). */
export async function drawPage(pdf: LoadedPdf, page: number): Promise<string> {
  const p = await pdf.doc.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: PRINT_WIDTH / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await p.render({ canvas, viewport }).promise;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('The page could not be drawn.');
  return URL.createObjectURL(blob);
}
