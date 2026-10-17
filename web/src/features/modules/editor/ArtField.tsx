// A module's logo or picture in the editor: upload one (purpose module_art), replace it or remove it, and the icon
// students see while there is none. The upload is only kept once the module is saved; the API attaches it then.
import { ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react';
import { useId, useRef, useState } from 'react';
import { checkUpload, progressText, uploadErrorMessage, uploadFile, UPLOAD_RULES, type UploadProgress } from '../../../api/uploads';
import { Button, ModuleArt, ModuleIcon, Select, moduleArtSrc } from '../../../ui';
import { MODULE_ICONS } from './draft';

export interface ArtFieldProps {
  art: string | null;
  icon: string;
  unitCode: string;
  onArt: (art: string | null) => void;
  onIcon: (icon: string) => void;
  error?: string;
}

const iconLabel = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2');

export function ArtField({ art, icon, unitCode, onArt, onIcon, error }: ArtFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const hintId = useId();
  const rules = UPLOAD_RULES.module_art;
  const shown = moduleArtSrc(art) !== null;

  const send = async (file: File) => {
    setProblem(null);
    const refused = checkUpload('module_art', file);
    if (refused) {
      setProblem(refused);
      return;
    }
    try {
      const up = await uploadFile('module_art', file, { onProgress: setProgress });
      if (up.mediaUrl) onArt(up.mediaUrl);
    } catch (e) {
      setProblem(uploadErrorMessage(e, 'module_art'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <fieldset className="medit-art" data-hub="module-art">
      <legend className="medit-art__legend">Logo or picture</legend>
      <div className="medit-art__row">
        {shown ? (
          <ModuleArt art={art} className="medit-art__preview" />
        ) : (
          <span className="medit-art__none" aria-hidden="true">
            {unitCode.trim() ? <span className="u-code">{unitCode.trim().toUpperCase()}</span> : <ModuleIcon name={icon || null} weight="duotone" />}
          </span>
        )}
        <div className="medit-art__text">
          <p className="medit-art__state">{shown ? 'Students see this picture beside the module’s name, on its page, on Home and in search.' : `No picture: students see ${unitCode.trim() ? 'the unit code' : 'the icon'} instead.`}</p>
          <p id={hintId} className="medit-art__hint">
            {rules.summary}
          </p>
          <div className="medit-art__actions">
            <input
              ref={input}
              type="file"
              accept={rules.accept}
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void send(file);
              }}
            />
            <Button variant="secondary" size="sm" leadingIcon={shown ? ImageSquare : UploadSimple} onClick={() => input.current?.click()} loading={progress !== null} aria-describedby={hintId} data-hub="module-art-upload">
              {shown ? 'Upload another' : 'Upload a picture'}
            </Button>
            {shown ? (
              <Button variant="ghost" size="sm" leadingIcon={Trash} onClick={() => onArt(null)}>
                Remove the picture
              </Button>
            ) : null}
          </div>
          {progress ? (
            <p className="medit-art__hint" aria-live="polite">
              {progressText(progress)}
            </p>
          ) : null}
          {problem || error ? (
            <p className="medit__error" role="alert">
              {problem ?? error}
            </p>
          ) : null}
        </div>
      </div>
      <Select
        label="Icon"
        hint="Where there’s no picture and no unit code to show."
        value={icon}
        onChange={(e) => onIcon(e.target.value)}
        placeholder="The book (default)"
        options={MODULE_ICONS.map((name) => ({ value: name, label: iconLabel(name) }))}
      />
    </fieldset>
  );
}
