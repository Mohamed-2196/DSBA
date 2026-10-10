import { useState, type ReactNode } from 'react';
import { fileIcon, sizeLabel, type Attachment } from './files';

/** A file that is not a picture: icon, name, size. `children` go at the end (the tray puts a remove button there). */
export function FileChip({ file, children }: { file: Attachment; children?: ReactNode }) {
  const Icon = fileIcon(file.name);
  return (
    <span className="nc-file">
      <Icon className="nc-file__icon" weight="duotone" aria-hidden="true" />
      <span className="nc-file__name" dir="auto">
        {file.name}
      </span>
      <span className="nc-file__size u-tabular">{sizeLabel(file.size)}</span>
      {children}
    </span>
  );
}

/** A picture the student sent. If the browser cannot draw it (some phone formats), it is shown as a file instead. */
export function Shot({ file, onLoad }: { file: Attachment; onLoad?: () => void }) {
  const [broken, setBroken] = useState(false);
  if (broken || !file.url) return <FileChip file={file} />;
  return <img className="nc-shot" src={file.url} alt={`Attached: ${file.name}`} onLoad={onLoad} onError={() => setBroken(true)} />;
}
