import { Badge, cx } from '../../../ui';
import { pageSizeOf } from '../data/kinds.js';
import { thumbSrc } from '../data/thumbs.js';
import { DocPage } from '../doc/DocPage.jsx';
import './FileThumb.css';

/**
 * A real-looking document thumbnail: the file's actual first page, scaled down.
 * Portrait pages fill the frame; slides, sheets and real pictures keep their own proportions and sit on the
 * frame's baseline. The `file-thumb` hook is the page itself (not the frame), so crops of it are tight.
 * @param {'grid'|'strip'|'list'|'mini'|'related'|'rail'} size
 * @param {boolean} newTag  highlighter "New" tag on the corner for files added this week
 */
export function FileThumb({ file, size = 'grid', page = 0, newTag = false, className, hook = true }) {
  const ps = pageSizeOf(file);
  const landscape = ps.w > ps.h;
  const image = file.image;
  return (
    <span
      className={cx('lib-thumb', `lib-thumb--${size}`, landscape && 'is-landscape', image && 'is-image', file.format === 'PPTX' && 'is-deck', className)}
      aria-hidden="true"
    >
      <span className="lib-thumb__paper" data-hub={hook ? 'file-thumb' : undefined}>
        <span className="lib-thumb__sheet" style={{ '--pw': ps.w, '--ph': ps.h }}>
          {image ? (
            <img className="lib-thumb__img" src={thumbSrc(image)} alt="" draggable={false} decoding="sync" />
          ) : (
            <DocPage file={file} index={page} />
          )}
        </span>
        {newTag && file.isNew ? <Badge tone="highlight" size="sm" className="lib-thumb__new">New</Badge> : null}
      </span>
    </span>
  );
}
