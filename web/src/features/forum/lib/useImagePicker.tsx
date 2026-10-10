import { useRef, type ReactNode } from 'react';
import { IMAGE_ACCEPT } from './uploads';

/** A hidden file input and a function that opens it. */
export function useImagePicker(onFile: (file: File) => void): { open: () => void; input: ReactNode } {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={IMAGE_ACCEPT}
      className="visually-hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = ''; // picking the same file again still fires onChange
        for (const f of files) onFile(f);
      }}
    />
  );
  return { open: () => ref.current?.click(), input };
}
