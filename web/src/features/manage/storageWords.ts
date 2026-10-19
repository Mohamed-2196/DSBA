// Words and shares for Manage's notebook numbers (NotebookNumbers.tsx). Pure (storageWords.test.ts).
import { formatSize } from '../../api/uploads';

const GB = 1024 * 1024 * 1024;

/** Like formatSize, and in GB from 1 GB: everyone's notes together run to many gigabytes. */
export function formatStorage(bytes: number): string {
  if (bytes < GB) return formatSize(bytes);
  const gb = bytes / GB;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

/** The share used, as a whole percent from 0 to 100 (1 when anything at all is used). */
export function usedPercent(used: number, limit: number): number {
  if (limit <= 0 || used <= 0) return 0;
  return Math.min(100, Math.max(1, Math.round((used / limit) * 100)));
}
