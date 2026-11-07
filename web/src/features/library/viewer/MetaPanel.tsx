import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatSize } from '../../../api/uploads';
import { hostOf } from '../../../lib/share';
import { cohortTextColor } from '../../../state';
import { useModules } from '../../../state/modules';
import { useAuth } from '../../../auth';
import { Button, CohortBadge, Count, Icon, Kbd, cx, formatDate, glyph, timeAgo } from '../../../ui';
import { itemPath, openLinkHref } from '../api';
import type { LinkState } from '../types';
import { addedAt, askAboutHref, examTitle, hasExamTitle, linkPlace, moduleTag } from '../display';
import { appUrl } from '../../../lib/share';
import { PaperThreads, useStartsThreads } from '../../forum/public';
import { examLabel } from '../../../lib/exams';
import { EXAM_KINDS, formatOf, kindLabel } from '../kinds';
import type { PaperQuestion } from '../../../api/types';
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

/** The file page's details column: module, facts, credit, description, the paper's sitting and its questions by
 *  topic, and the original. `onQuestion` opens a PDF at a tagged question. */
export function MetaPanel({
  item,
  linkState,
  className,
  id,
  onQuestion,
}: {
  item: LibraryItem;
  linkState?: LinkState;
  className?: string;
  id?: string;
  onQuestion: (tag: PaperQuestion) => void;
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
            leadingIcon={<Icon glyph={glyph.forum} />}
            fullWidth
            data-hub="ask-about-paper"
          >
            Ask about this paper
          </Button>
          {/* The module's threads that already link this paper (UX-72). */}
          <PaperThreads slug={item.slug} headingLevel={3} />
        </section>
      ) : null}
      {tagging ? <QuestionTags item={item} onQuestion={onQuestion} /> : null}

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
            <Icon glyph={glyph.link} />
            Original on {linkPlace(item)}
          </h2>
          <p>It stays where it was shared. The button opens it in a new tab.</p>
          <Button href={openLinkHref(item)} trailingIcon={<Icon glyph={glyph.external} />} fullWidth>
            Open in {linkPlace(item)}
          </Button>
        </section>
      ) : null}

      <section className="lib-meta__keys" aria-label="Keyboard shortcuts">
        <p>
          <span className="lib-meta__keycaps">
            <Kbd>Esc</Kbd>
          </span>{' '}
          Go back
        </p>
      </section>
    </aside>
  );
}
