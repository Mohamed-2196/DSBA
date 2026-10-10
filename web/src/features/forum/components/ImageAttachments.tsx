import { ArrowClockwise, ImageSquare, WarningCircle, X } from '@phosphor-icons/react';
import { IconButton, cx } from '../../../ui';
import { formatBytes, type ImageUpload } from '../lib/uploads';

export interface AttachmentListProps {
  uploads: ImageUpload[];
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

/** The pictures being attached: a preview each, with progress, the problem when there is one, and remove. */
export function AttachmentList({ uploads, onRemove, onRetry }: AttachmentListProps) {
  if (!uploads.length) return null;
  return (
    <ul role="list" className="forum-attachments" aria-label="Attached images">
      {uploads.map((u) => (
        <li key={u.key}>
          <figure className={cx('forum-attachment', `is-${u.phase}`)} data-hub="composer-attachment">
            {u.previewUrl ? (
              <div className="forum-attachment__media">
                <img className="forum-attachment__img" src={u.previewUrl} alt="" />
                {u.phase === 'uploading' ? (
                  <span className="forum-attachment__progress" aria-hidden="true">
                    <span style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </span>
                ) : null}
              </div>
            ) : null}
            <figcaption className="forum-attachment__bar">
              {u.phase === 'error' ? (
                <WarningCircle aria-hidden="true" weight="fill" className="forum-attachment__icon is-error" />
              ) : (
                <ImageSquare aria-hidden="true" weight="duotone" className="forum-attachment__icon" />
              )}
              <span className="forum-attachment__name">{u.fileName}</span>
              {/* Announced once per phase (uploading, added, the problem); the percentage is for the eyes only. */}
              <span className={cx('forum-attachment__meta', u.phase === 'error' && 'is-error')} aria-live="polite">
                {u.phase === 'uploading' ? 'Uploading…' : u.phase === 'error' ? u.error : `${formatBytes(u.size)} · in your post`}
              </span>
              {u.phase === 'uploading' ? (
                <span className="forum-attachment__pct u-tabular" aria-hidden="true">
                  {Math.round(u.progress * 100)}%
                </span>
              ) : null}
              {u.phase === 'error' && u.retryable ? (
                <IconButton size="sm" icon={ArrowClockwise} label={`Try ${u.fileName} again`} tooltip tooltipSide="top" onClick={() => onRetry(u.key)} />
              ) : null}
              <IconButton
                size="sm"
                icon={X}
                label={u.phase === 'uploading' ? `Cancel uploading ${u.fileName}` : `Remove ${u.fileName}`}
                tooltip
                tooltipSide="top"
                onClick={() => onRemove(u.key)}
                className="forum-attachment__remove"
              />
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
