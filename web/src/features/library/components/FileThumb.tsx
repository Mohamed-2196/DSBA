import { GoogleDriveLogo, LinkSimple } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import type { ModuleSummary } from '../../../api/types';
import { useModules } from '../../../state/modules';
import { Badge, cx } from '../../../ui';
import { isNew, linkPlace, moduleTag } from '../display';
import { formatOf, kindLabel } from '../kinds';
import type { LibraryItem } from '../types';
import './FileThumb.css';

export type ThumbSize = 'grid' | 'strip' | 'list' | 'related' | 'mini';

/**
 * A file's cover: an A4 title page set in the module's cohort colour (module code, kind, title, format).
 * Laid out at full page size and scaled down, so every size reads as the same document. Decorative: the
 * surrounding link names the file.
 */
export function FileThumb({
  item,
  size = 'grid',
  newTag = false,
  className,
}: {
  item: LibraryItem;
  size?: ThumbSize;
  newTag?: boolean;
  className?: string;
}) {
  const { getModule } = useModules();
  const m: ModuleSummary | null = getModule(item.moduleId);
  const year = m?.year ?? item.year ?? null;
  const fmt = formatOf(item);
  const isLink = item.source === 'link';
  const code = moduleTag(m);
  return (
    <span className={cx('lib-thumb', `lib-thumb--${size}`, isLink && 'is-link', className)} aria-hidden="true">
      <span className="lib-thumb__paper" data-theme="light">
        <span className="lib-thumb__sheet">
          <span
            className="lib-cover"
            style={{ '--cover': year ? `var(--y${year})` : 'var(--ink-3)', '--cover-ink': year ? `var(--y${year}-strong)` : 'var(--ink)' } as CSSProperties}
          >
            <span className="lib-cover__kind">{kindLabel(item.kind)}</span>
            {code ? <span className={cx('lib-cover__code', !m?.unitCode && 'is-name')}>{code}</span> : null}
            {m ? <span className="lib-cover__module">{m.name}</span> : null}
            <span className="lib-cover__rule" />
            <span className="lib-cover__title">{item.title}</span>
            <span className="lib-cover__foot">
              {isLink ? (
                <span className="lib-cover__place">
                  {linkPlace(item) === 'Google Drive' ? <GoogleDriveLogo weight="fill" /> : <LinkSimple weight="bold" />}
                  {linkPlace(item)}
                </span>
              ) : fmt ? (
                <span className="lib-cover__fmt">{fmt.tag}</span>
              ) : null}
              {item.examYear ? (
                <span className="lib-cover__exam">
                  {item.examYear}
                  {item.zone ? ` · Zone ${item.zone}` : ''}
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </span>
      {newTag && isNew(item) ? (
        <Badge tone="highlight" size="sm" className="lib-thumb__new">
          New
        </Badge>
      ) : null}
    </span>
  );
}
