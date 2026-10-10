import { ArrowSquareOut, DownloadSimple, GoogleDriveLogo } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cohortTextColor } from '../../../state';
import { useModules } from '../../../state/modules';
import { Button, CohortBadge, Kbd, Skeleton, cx, formatDate, timeAgo } from '../../../ui';
import { downloadHref, itemPath, openLinkHref, useLibraryList } from '../api';
import type { LinkState } from '../components/FileCard';
import { FileThumb } from '../components/FileThumb';
import { addedAt, examLabel, linkHost, linkPlace, sizeLabel } from '../display';
import { formatOf, formatSize, kindLabel } from '../kinds';
import type { LibraryItem } from '../types';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lib-meta__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { moderator: 'Student rep', admin: 'Admin' };

/** Other published files of the same module. */
function MoreFromModule({ item, linkState }: { item: LibraryItem; linkState?: LinkState }) {
  const more = useLibraryList({ moduleId: item.moduleId, sort: 'popular' }, { limit: 6, enabled: !!item.moduleId });
  if (!item.moduleId) return null;
  const list = (more.data?.items ?? []).filter((f) => f.id !== item.id).slice(0, 5);
  if (more.isPending) {
    return (
      <section className="lib-meta__related" aria-label="More from this module">
        <Skeleton lines={3} />
      </section>
    );
  }
  if (!list.length) return null;
  return (
    <section className="lib-meta__related" aria-labelledby="lib-meta-related">
      <h2 id="lib-meta-related" className="lib-meta__h">
        More from this module
      </h2>
      <ul role="list">
        {list.map((f) => (
          <li key={f.id}>
            <Link to={itemPath(f)} state={linkState} className="lib-related">
              <FileThumb item={f} size="related" />
              <span className="lib-related__text">
                <span className="lib-related__title">{f.title}</span>
                <span className="lib-related__meta">
                  {kindLabel(f.kind)}, {sizeLabel(f)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The file page's details column: module, facts, credit, description, the original, more from the module. */
export function MetaPanel({ item, linkState, className, id }: { item: LibraryItem; linkState?: LinkState; className?: string; id?: string }) {
  const { getModule } = useModules();
  const m = getModule(item.moduleId);
  const fmt = formatOf(item);
  const exam = examLabel(item);
  const who = item.uploadedBy;
  const isLink = item.source === 'link';
  const host = linkHost(item.url);
  return (
    <aside id={id} className={cx('lib-meta', className)} data-hub="file-meta" aria-label="File details">
      {m ? (
        <section className="lib-meta__module">
          <Link to={`/modules/${m.id}?tab=files`} className="lib-meta__module-link">
            {m.unitCode ? (
              <span className="lib-meta__code u-code" style={{ color: cohortTextColor(m.year) }}>
                {m.unitCode}
              </span>
            ) : null}
            <span className="lib-meta__module-name">{m.name}</span>
          </Link>
          <CohortBadge year={m.year} size="sm" />
        </section>
      ) : null}

      <dl className="lib-meta__list">
        <Row label="Type">{kindLabel(item.kind)}</Row>
        {exam ? <Row label="Exam">{exam}</Row> : null}
        {item.authorName ? <Row label="Author">{item.authorName}</Row> : null}
        <Row label={item.status === 'published' ? 'Added' : 'Uploaded'}>
          <time dateTime={addedAt(item)} title={formatDate(addedAt(item))}>
            {timeAgo(addedAt(item))}
          </time>
          {who ? (
            <span className="lib-meta__sub">
              by {who.displayName}
              {ROLE_LABEL[who.role] ? `, ${ROLE_LABEL[who.role]}` : who.year ? `, Year ${who.year}` : ''}
            </span>
          ) : null}
        </Row>
        {isLink ? (
          <Row label="Where">{host ? `${linkPlace(item)} (${host})` : linkPlace(item)}</Row>
        ) : (
          <>
            {fmt ? <Row label="Format">{fmt.name}</Row> : null}
            {item.sizeBytes ? <Row label="Size">{formatSize(item.sizeBytes)}</Row> : null}
          </>
        )}
        <Row label={isLink ? 'Opened' : 'Downloads'}>
          <span className="u-tabular">{item.downloadCount.toLocaleString('en-GB')}</span>
          {isLink ? (item.downloadCount === 1 ? ' time' : ' times') : null}
        </Row>
      </dl>

      {item.description ? (
        <section className="lib-meta__desc" aria-labelledby="lib-meta-desc">
          <h2 id="lib-meta-desc" className="lib-meta__h">
            About this file
          </h2>
          <p>{item.description}</p>
        </section>
      ) : null}

      {item.status === 'removed' ? null : isLink ? (
        <section className="lib-meta__source" aria-labelledby="lib-meta-source">
          <h2 id="lib-meta-source" className="lib-meta__h">
            <GoogleDriveLogo aria-hidden="true" weight="duotone" />
            Original on {linkPlace(item)}
          </h2>
          <p>It stays where it was shared{host ? `, on ${host}` : ''}. The button opens it in a new tab.</p>
          <Button href={openLinkHref(item)} trailingIcon={ArrowSquareOut} fullWidth>
            Open in {linkPlace(item)}
          </Button>
        </section>
      ) : (
        <section className="lib-meta__source" aria-labelledby="lib-meta-source">
          <h2 id="lib-meta-source" className="lib-meta__h">
            <DownloadSimple aria-hidden="true" weight="duotone" />
            Download
          </h2>
          {item.fileName ? <p className="lib-meta__filename">{item.fileName}</p> : null}
          <Button href={downloadHref(item)} leadingIcon={DownloadSimple} fullWidth>
            Download{item.sizeBytes ? ` (${formatSize(item.sizeBytes)})` : ''}
          </Button>
        </section>
      )}

      {item.status === 'published' ? <MoreFromModule item={item} linkState={linkState} /> : null}

      <section className="lib-meta__keys" aria-label="Keyboard shortcuts">
        <p>
          <span className="lib-meta__keycaps">
            <Kbd>Esc</Kbd>
          </span>{' '}
          Back to the library
        </p>
      </section>
    </aside>
  );
}
