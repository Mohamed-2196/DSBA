// Manage → Newsletter, its settings (newsletter.manage): the line under the newsletter's name, and the pictures its
// editor offers to choose for a cover or beside a section. A picture is uploaded here once and offered to every issue;
// an uploaded one is kept while it's offered. Saved together from the version loaded (newsletter_settings_changed when
// someone else saved first). Every save goes to the activity log with what changed, before and after.
import { UploadSimple } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import { pictureSrc } from '../../../api/pictures';
import { UPLOAD_RULES, checkUpload, progressText, uploadErrorMessage, uploadFile, type UploadProgress } from '../../../api/uploads';
import type { NewsletterPicture, NewsletterSettings, NewsletterSettingsEditable } from '../../../api/types';
import { useToast } from '../../../state';
import { Badge, Button, Chip, Panel, QueryError, Skeleton, Switch, TextArea, TextField, cx } from '../../../ui';
import { DocFrame, ListEditor, docErrors, focusDocStatus, hasErrorUnder, newItemId, type DocProblem } from '../../site/public';
import { useNewsletterSettingsForEditing, useReloadNewsletterSettings, useSaveNewsletterSettings } from '../api';
import { readImageDimensions } from '../editor/pictures';
import './NewsletterSettings.css';

type Section = 'masthead' | 'pictures';

const SECTIONS: { id: Section; label: string; about: string; parts: string[] }[] = [
  { id: 'masthead', label: 'Under its name', about: 'The line under the newsletter’s name, at the top of the newsletter’s page.', parts: ['masthead'] },
  { id: 'pictures', label: 'Pictures to choose from', about: 'What an issue’s editor offers for its cover and beside its sections. An issue can still upload a picture of its own.', parts: ['pictures'] },
];

export function NewsletterSettingsEditor() {
  const query = useNewsletterSettingsForEditing();
  const [section, setSection] = useState<Section>('masthead');
  if (query.isError) return <QueryError error={query.error} title="The newsletter’s settings didn’t load" onRetry={() => void query.refetch()} retrying={query.isFetching} size="sm" />;
  if (query.isPending) {
    return (
      <Panel padding="md">
        <Skeleton lines={6} />
      </Panel>
    );
  }
  // A new version (saved here, or loaded again) starts a new draft.
  return <Editor key={query.data.version} loaded={query.data} section={section} setSection={setSection} />;
}

function Editor({ loaded, section, setSection }: { loaded: NewsletterSettingsEditable; section: Section; setSection: (s: Section) => void }) {
  const saved = loaded.data;
  const [doc, setDoc] = useState<NewsletterSettings>(saved);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<DocProblem | null>(null);
  const save = useSaveNewsletterSettings();
  const reload = useReloadNewsletterSettings();
  const { push: toast } = useToast();
  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);
  const savedIds = useMemo(() => new Set(saved.pictures.map((p) => p.id)), [saved]);
  const err = (path: string) => fields[path];

  const submit = () => {
    setProblem(null);
    save.mutate(
      { version: loaded.version, data: doc },
      {
        onSuccess: () => {
          setFields({});
          toast({ title: 'Saved. Editors see the changes now.', tone: 'success' });
          focusDocStatus();
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'newsletter_settings_changed') return setProblem({ kind: 'changed', what: 'the newsletter’s settings' });
          const found = docErrors(isApiError(e) ? e.fields : {}, ['pictures']);
          setFields(found.fields);
          const marked = Object.keys(found.fields).length ? ['Some fields need a look before saving. They’re marked below.'] : [];
          const messages = [...found.general, ...marked];
          setProblem({ kind: 'other', messages: messages.length ? messages : [errorMessage(e)] });
          const first = SECTIONS.find((s) => s.parts.some((p) => hasErrorUnder(found.fields, p)));
          if (first) setSection(first.id);
        },
      },
    );
  };

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <section className="nl-set" aria-labelledby="nl-settings-title">
      <h3 id="nl-settings-title" className="nl-set__title">
        Settings
      </h3>
      <DocFrame
        title="the newsletter’s settings"
        savedAt={loaded.updatedAt}
        savedBy={loaded.updatedBy?.displayName ?? null}
        dirty={dirty}
        saving={save.isPending}
        pageTo="/newsletter"
        onUndo={() => {
          setDoc(saved);
          setFields({});
          setProblem(null);
        }}
        onSave={submit}
        problem={problem}
        onReload={() => void reload()}
        section={{ title: current.label, about: current.about }}
        nav={SECTIONS.map((s) => (
          <Chip key={s.id} selected={s.id === section} onChange={() => setSection(s.id)} className={cx(s.parts.some((p) => hasErrorUnder(fields, p)) && 'dedit__nav-error')}>
            {s.label}
          </Chip>
        ))}
      >
        {section === 'masthead' ? (
          <TextArea label="Under the newsletter’s name" value={doc.masthead} onChange={(e) => setDoc((d) => ({ ...d, masthead: e.target.value }))} error={err('masthead')} rows={3} maxLength={300} required />
        ) : (
          <>
            <ListEditor<NewsletterPicture>
              items={doc.pictures}
              noun="picture"
              titleOf={(p) => p.label}
              metaOf={(p) => <PictureMeta picture={p} />}
              savedIds={savedIds}
              onChange={(pictures) => setDoc((d) => ({ ...d, pictures }))}
              make={() => ({ id: newItemId('picture', doc.pictures.map((p) => p.id)), src: '', label: '', width: 1, height: 1, cover: false })}
              hasError={(i) => hasErrorUnder(fields, `pictures.${i}`)}
              canAdd={false}
              max={24}
            >
              {(p, i, change) => (
                <div className="dedit-grid">
                  <PictureThumb picture={p} />
                  <div className="nl-set__fields">
                    <TextField label="What it shows" hint="Editors see this beside it." value={p.label} onChange={(e) => change({ label: e.target.value })} error={err(`pictures.${i}.label`) ?? err(`pictures.${i}.src`)} maxLength={80} required />
                    <Switch label="Fits a cover" description="Portrait, 3 by 4. Offered for covers as well as beside sections." checked={p.cover ?? false} onChange={(cover) => change({ cover })} />
                  </div>
                </div>
              )}
            </ListEditor>
            {doc.pictures.length < 24 ? <AddPicture taken={doc.pictures.map((p) => p.id)} onAdd={(p) => setDoc((d) => ({ ...d, pictures: [...d.pictures, p] }))} /> : null}
          </>
        )}
      </DocFrame>
    </section>
  );
}

function PictureMeta({ picture }: { picture: NewsletterPicture }) {
  return (
    <span className="nl-set__meta">
      {picture.cover ? (
        <Badge tone="neutral" size="sm">
          Cover
        </Badge>
      ) : null}
      <span className="u-tabular">{`${picture.width} × ${picture.height}`}</span>
    </span>
  );
}

function PictureThumb({ picture }: { picture: NewsletterPicture }) {
  const src = pictureSrc(picture.src);
  return <span className="nl-set__thumb">{src ? <img src={src} alt="" width={picture.width} height={picture.height} loading="lazy" decoding="async" /> : null}</span>;
}

/** Uploads a picture and adds it to the list, named after its file until it's renamed. */
function AddPicture({ taken, onAdd }: { taken: string[]; onAdd: (picture: NewsletterPicture) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkUpload('newsletter_image', file);
    if (problem) return setError(problem);
    setError(null);
    setUploading(true);
    try {
      const [dims, out] = await Promise.all([readImageDimensions(file), uploadFile('newsletter_image', file, { onProgress: setProgress })]);
      const label = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || 'New picture';
      onAdd({ id: newItemId('picture', taken), src: out.mediaUrl ?? `/api/v1/media/${out.uploadId}`, label, width: dims.width, height: dims.height, cover: dims.height / dims.width > 1.2 });
    } catch (e) {
      setError(uploadErrorMessage(e, 'newsletter_image'));
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <div className="nl-set__add">
      <input ref={fileRef} type="file" accept={UPLOAD_RULES.newsletter_image.accept} hidden onChange={(e) => void pick(e.target.files?.[0])} disabled={uploading} />
      <Button variant="secondary" leadingIcon={UploadSimple} onClick={() => fileRef.current?.click()} loading={uploading}>
        {uploading ? (progress ? progressText(progress) : 'Uploading…') : 'Upload a picture'}
      </Button>
      <p className="dedit__note">{UPLOAD_RULES.newsletter_image.summary} It’s offered once you save.</p>
      {error ? (
        <p className="dedit__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
