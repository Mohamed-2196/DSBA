import { LinkSimple } from '@phosphor-icons/react';
import { useState, type CSSProperties } from 'react';
import type { ModuleSummary } from '../../../api/types';
import { useModules } from '../../../state/modules';
import { Badge, cx } from '../../../ui';
import { isNew, linkPlace, moduleTag } from '../display';
import { zoneLabel } from '../../../lib/exams';
import { formatOf, kindLabel } from '../kinds';
import type { LibraryItem } from '../types';
import { useCoverStyle, type CoverStyle } from './coverStyle';
import './FileThumb.css';

export type ThumbSize = 'grid' | 'strip' | 'list' | 'related' | 'mini';
export type { CoverStyle };

/**
 * A file's cover: by default (`'original'`) its real first page (`coverUrl`, made by the API's text worker) for PDF
 * and Word files, or when toggled to `'styled'` (or when no cover image exists) an A4 title page set in the module's
 * cohort colour (module code, kind, title, format), laid out at full page size and scaled down.
 */
export function FileThumb({
  item,
  size = 'grid',
  newTag = false,
  formatTag = false,
  coverStyle,
  className,
}: {
  item: LibraryItem;
  size?: ThumbSize;
  newTag?: boolean;
  /** the file's format as a small tag in the cover's corner (a styled cover prints it on the page already) */
  formatTag?: boolean;
  coverStyle?: CoverStyle;
  className?: string;
}) {
  const { getModule } = useModules();
  const [storedStyle] = useCoverStyle();
  const effectiveStyle = coverStyle ?? storedStyle;
  const m: ModuleSummary | null = getModule(item.moduleId);
  const year = m?.year ?? item.year ?? null;
  const fmt = formatOf(item);
  const isLink = item.source === 'link';
  const code = moduleTag(m);
  const [broken, setBroken] = useState(false);
  const photo = effectiveStyle === 'original' && item.coverUrl && !broken ? item.coverUrl : null;
  return (
    <span className={cx('lib-thumb', `lib-thumb--${size}`, isLink && 'is-link', className)} aria-hidden="true">
      <span className="lib-thumb__paper" data-theme="light">
        <span className="lib-thumb__sheet">
          {photo ? (
            <img
              className="lib-thumb__photo"
              src={photo}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              onError={() => setBroken(true)}
            />
          ) : (
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
                    <LinkSimple weight="bold" />
                    {linkPlace(item)}
                  </span>
                ) : fmt ? (
                  <span className="lib-cover__fmt">{fmt.tag}</span>
                ) : null}
                {item.examYear ? (
                  <span className="lib-cover__exam">
                    {item.examYear}
                    {item.zone ? ` · ${zoneLabel(item.zone)}` : ''}
                  </span>
                ) : null}
              </span>
            </span>
          )}
        </span>
      </span>
      {formatTag && photo && fmt ? <span className="lib-thumb__fmt">{fmt.tag}</span> : null}
      {newTag && isNew(item) ? (
        <Badge tone="highlight" size="sm" className="lib-thumb__new">
          New
        </Badge>
      ) : null}
    </span>
  );
}
