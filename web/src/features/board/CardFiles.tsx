// A card's files in its drawer: add several at once, see the pictures, open or save any file, make a picture the
// card's cover, delete one.
import {
  DownloadSimple,
  File as FileIcon,
  FileCsv,
  FileDoc,
  FilePdf,
  FilePpt,
  FileXls,
  ImageSquare,
  Paperclip,
  Plus,
  Trash,
  type Icon,
} from '@phosphor-icons/react';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import type { BoardCardDetail, CardAttachment } from '../../api/types';
import {
  checkUpload,
  fileExtension,
  formatSize,
  progressText,
  uploadErrorMessage,
  uploadFile,
  UPLOAD_RULES,
  type UploadProgress,
} from '../../api/uploads';
import { useToast } from '../../state';
import { Badge, Button, ConfirmDialog, IconButton } from '../../ui';
import { boardFileHref, useAttachFile, useDetachFile, useUpdateCard } from './api';

/** The API keeps up to 10 files on a card. */
const MAX_FILES = 10;

const KIND_ICON: Record<string, Icon> = {
  pdf: FilePdf,
  doc: FileDoc,
  docx: FileDoc,
  xls: FileXls,
  xlsx: FileXls,
  csv: FileCsv,
  ppt: FilePpt,
  pptx: FilePpt,
};

export function CardFiles({ card, readOnly }: { card: BoardCardDetail; readOnly: boolean }) {
  const headingId = useId();
  const toast = useToast();
  const attach = useAttachFile();
  const detach = useDetachFile();
  const update = useUpdateCard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState<{ name: string; progress: UploadProgress } | null>(null);
  const [deleting, setDeleting] = useState<CardAttachment | null>(null);
  const files = card.attachments;
  const pictures = files.filter((f) => f.image);
  const others = files.filter((f) => !f.image);
  const full = files.length >= MAX_FILES;

  const send = async (chosen: File[]) => {
    let room = MAX_FILES - files.length;
    for (const file of chosen) {
      if (room <= 0) {
        toast.push({
          tone: 'alert',
          title: `${file.name} wasn’t added`,
          body: `A card holds ${MAX_FILES} files. Delete one first.`,
        });
        continue;
      }
      const problem = checkUpload('board', file);
      if (problem) {
        toast.push({ tone: 'alert', title: `${file.name} wasn’t added`, body: problem });
        continue;
      }
      setSending({ name: file.name, progress: { loaded: 0, total: file.size } });
      try {
        const up = await uploadFile('board', file, {
          onProgress: (progress) => setSending({ name: file.name, progress }),
        });
        await attach.mutateAsync({ cardId: card.id, boardId: card.boardId, uploadId: up.uploadId });
        room -= 1;
      } catch (e) {
        toast.push({ tone: 'alert', title: `${file.name} wasn’t added`, body: uploadErrorMessage(e, 'board') });
      }
    }
    setSending(null);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (chosen.length) void send(chosen);
  };

  const setCover = (file: CardAttachment | null) =>
    update.mutate({ id: card.id, boardId: card.boardId, patch: { coverId: file ? file.id : null } });

  const actions = (file: CardAttachment) => (
    <span className="card-files__actions">
      {file.image && !readOnly ? (
        card.coverUrl === file.url ? (
          <Button size="sm" variant="ghost" onClick={() => setCover(null)}>
            Remove cover
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setCover(file)}>
            Make cover
          </Button>
        )
      ) : null}
      <IconButton
        label={`Download ${file.fileName}`}
        icon={DownloadSimple}
        size="sm"
        href={boardFileHref(file.id, true)}
        external={false}
        download={file.fileName}
      />
      {readOnly ? null : (
        <IconButton label={`Delete ${file.fileName}`} icon={Trash} size="sm" onClick={() => setDeleting(file)} />
      )}
    </span>
  );

  return (
    <section className="card-detail__section" aria-labelledby={headingId}>
      <div className="card-detail__section-head">
        <h3 className="card-detail__h" id={headingId}>
          <Paperclip aria-hidden="true" />
          Files
          {files.length ? <span className="card-detail__h-count">{files.length}</span> : null}
        </h3>
        {readOnly ? null : (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              accept={UPLOAD_RULES.board.accept}
              onChange={onPick}
            />
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={Plus}
              loading={!!sending}
              disabled={full}
              onClick={() => inputRef.current?.click()}
              data-hub="board-add-file"
            >
              Add files
            </Button>
          </>
        )}
      </div>

      {sending ? (
        <p className="card-files__sending" role="status">
          {sending.name}: {progressText(sending.progress)}
        </p>
      ) : null}

      {pictures.length ? (
        <ul role="list" className="card-files__pictures">
          {pictures.map((file) => (
            <li key={file.id} className="card-files__picture">
              <a href={boardFileHref(file.id)} target="_blank" rel="noopener noreferrer" className="card-files__thumb">
                <img src={boardFileHref(file.id)} alt="" loading="lazy" decoding="async" />
                <span className="visually-hidden">Open {file.fileName} (opens in a new tab)</span>
              </a>
              <div className="card-files__meta">
                <span className="card-files__name" title={file.fileName}>
                  {file.fileName}
                </span>
                <span className="card-files__size">
                  {formatSize(file.sizeBytes)}
                  {card.coverUrl === file.url ? (
                    <Badge tone="cobalt" size="sm" icon={ImageSquare}>
                      Cover
                    </Badge>
                  ) : null}
                </span>
              </div>
              {actions(file)}
            </li>
          ))}
        </ul>
      ) : null}

      {others.length ? (
        <ul role="list" className="card-files__list">
          {others.map((file) => {
            const KindIcon = KIND_ICON[fileExtension(file.fileName) ?? ''] ?? FileIcon;
            return (
              <li key={file.id} className="card-files__file">
                <KindIcon className="card-files__icon" aria-hidden="true" />
                <div className="card-files__meta">
                  <a
                    href={boardFileHref(file.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-files__name"
                    title={file.fileName}
                  >
                    {file.fileName}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                  <span className="card-files__size">{formatSize(file.sizeBytes)}</span>
                </div>
                {actions(file)}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!files.length && !sending ? (
        <p className="card-detail__none">
          {readOnly
            ? 'No files.'
            : 'Add a brief, a PDF or photos of your notes. Pictures show here, and one can be the card’s cover.'}
        </p>
      ) : null}
      {full && !readOnly ? (
        <p className="card-detail__none">A card holds {MAX_FILES} files. Delete one to add another.</p>
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Delete ${deleting.fileName}?` : ''}
        body="It goes from this card for good."
        confirmLabel="Delete file"
        tone="danger"
        onConfirm={() => {
          if (deleting) detach.mutate({ cardId: card.id, boardId: card.boardId, uploadId: deleting.id });
          setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
