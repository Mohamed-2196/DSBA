import { Badge, cx } from '../../../ui';
import { pageSizeFor } from '../data/kinds.js';
import { DocPage } from '../doc/DocPage.jsx';
import './FileThumb.css';

/**
 * A real-looking document thumbnail: the file's actual first page, scaled down.
 * Portrait pages fill the frame; slides and sheets sit on the frame's baseline.
 * @param {'grid'|'strip'|'list'|'mini'|'related'|'rail'} size
 * @param {boolean} newTag  highlighter "New" tag on the corner for files added this week
 */
export function FileThumb({ file, size = 'grid', page = 0, newTag = false, className, hook = true }) {
  const ps = pageSizeFor(file.format);
  const landscape = ps.w > ps.h;
  return (
    <span
      className={cx('lib-thumb', `lib-thumb--${size}`, landscape && 'is-landscape', file.format === 'PPTX' && 'is-deck', className)}
      data-hub={hook ? 'file-thumb' : undefined}
      aria-hidden="true"
    >
      <span className="lib-thumb__paper">
        <span className="lib-thumb__sheet" style={{ '--pw': ps.w, '--ph': ps.h }}>
          <DocPage file={file} index={page} />
        </span>
        {newTag && file.isNew ? <Badge tone="highlight" size="sm" className="lib-thumb__new">New</Badge> : null}
      </span>
    </span>
  );
}
