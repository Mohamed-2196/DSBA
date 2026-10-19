import { ArrowSquareOut, ChatsCircle, LinkSimple } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatSize } from '../../../api/uploads';
import { hostOf } from '../../../lib/share';
import { cohortTextColor } from '../../../state';
import { useModules } from '../../../state/modules';
import { useAuth } from '../../../auth';
import { Button, CohortBadge, Count, Kbd, Skeleton, cx, formatDate, timeAgo } from '../../../ui';
import { itemPath, openLinkHref, useLibraryList } from '../api';
import type { LinkState } from '../components/FileCard';
import { FileThumb } from '../components/FileThumb';
import { addedAt, askAboutHref, examTitle, hasExamTitle, linkPlace, moduleTag, sizeLabel } from '../display';
import { appUrl } from '../../../lib/share';
import { useStartsThreads } from '../../forum/public';
import { examLabel } from '../../../lib/exams';
import { EXAM_KINDS, formatOf, kindLabel } from '../kinds';
import type { LibraryItem } from '../types';
import { QuestionTags } from './QuestionTags';
import { SittingPanel } from './SittingPanel';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lib-meta__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Other published files of the same module: for a paper, the newest sittings first; else the most downloaded. */
function MoreFromModule({ item, linkState }: { item: LibraryItem; linkState?: LinkState }) {
  const more = useLibraryList(
    { moduleId: item.moduleId, sort: EXAM_KINDS.has(item.kind) ? 'sitting' : 'popular' },
    { limit: 6, enabled: !!item.moduleId },
  );
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
            <Link to={itemPath(f)} state={linkState} className="lib-related" title={f.title}>
              <FileThumb item={f} size="related" />
              <span className="lib-related__text">
                <span className="lib-related__title">{examTitle(f, null)}</span>
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

/** The file page's details column: module, facts, credit, description, the paper's sitting and its questions by
 *  topic, the original, more from the module. `onPage` opens a PDF at a page. */
export function MetaPanel({
  item,
  linkState,
  className,
  id,
  onPage,
}: {
  item: LibraryItem;
  linkState?: LinkState;
  className?: string;
  id?: string;
  onPage: (page: number) => void;
}) {
  const { getModule } = useModules();
  const { featureOn } = useAuth();
  const published = item.status === 'published' && item.source === 'file';
  const tagging = published && item.kind === 'past-paper' && !!item.moduleId && featureOn('library.questions');
  const startsThreads = useStartsThreads();
  const asking = published && EXAM_KINDS.has(item.kind) && !!item.moduleId && startsThreads;
  const m = getModule(item.moduleId);
  const fmt = formatOf(item);
  const exam = examLabel(item);
  const who = item.uploadedBy;
  const isLink = item.source === 'link';
  const host = hostOf(item.url);
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
        {exam && !hasExamTitle(item) ? <Row label="Exam">{exam}</Row> : null}
        {item.authorName ? <Row label="Author">{item.authorName}</Row> : null}
        {who ? (
          <Row label="Shared by">
            {who.displayName}
            <span className="lib-meta__sub">{who.badge ?? (who.year ? `Year ${who.year}` : null)}</span>
          </Row>
        ) : null}
        <Row label={item.status === 'published' ? 'Added' : 'Uploaded'}>
          <time dateTime={addedAt(item)} title={formatDate(addedAt(item))}>
            {timeAgo(addedAt(item))}
          </time>
        </Row>
        {isLink ? (
          <Row label="Where">{host && host !== linkPlace(item) ? `${linkPlace(item)} (${host})` : linkPlace(item)}</Row>
        ) : (
          <>
            {item.fileName ? (
              <Row label="File">
                <span className="lib-meta__filename">{item.fileName}</span>
              </Row>
            ) : null}
            {fmt ? <Row label="Format">{fmt.name}</Row> : null}
            {item.sizeBytes ? <Row label="Size">{formatSize(item.sizeBytes)}</Row> : null}
          </>
        )}
        <Row label={isLink ? 'Opened' : 'Downloads'}>
          <Count value={item.downloadCount} />
          {isLink ? (item.downloadCount === 1 ? ' time' : ' times') : null}
        </Row>
      </dl>

      {published ? <SittingPanel item={item} linkState={linkState} /> : null}
      {asking ? (
        <section className="lib-meta__ask" aria-labelledby="lib-meta-ask">
          <h2 id="lib-meta-ask" className="lib-meta__h">
            Stuck on a question?
          </h2>
          <Button
            to={askAboutHref(item, examTitle(item, moduleTag(m)), appUrl(itemPath(item)))}
            leadingIcon={ChatsCircle}
            fullWidth
            data-hub="ask-about-paper"
          >
            Ask about this paper
          </Button>
        </section>
      ) : null}
      {tagging ? <QuestionTags item={item} onPage={onPage} /> : null}

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
            <LinkSimple aria-hidden="true" weight="duotone" />
            Original on {linkPlace(item)}
          </h2>
          <p>It stays where it was shared. The button opens it in a new tab.</p>
          <Button href={openLinkHref(item)} trailingIcon={ArrowSquareOut} fullWidth>
            Open in {linkPlace(item)}
          </Button>
        </section>
      ) : null}

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
