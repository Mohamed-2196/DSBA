import { Link } from 'react-router-dom';
import { cardMeta, moduleTag, titleHasModule } from '../data/display';
import { FavouriteTag } from './FavouriteTag';
import { FileThumb } from './FileThumb';
import { StarButton } from './StarButton';

/** Grid item: the document itself is the card (no chrome), title and one line of meta below. */
export function FileCard({ file, sort = 'newest', starred = false, onToggleStar, linkState, thumbSize = 'grid' }) {
  return (
    <article className="lib-card" data-hub="file-card">
      <Link to={file.url} state={linkState} className="lib-card__link">
        <FileThumb file={file} size={thumbSize} newTag />
        <span className="lib-card__title">
          {file.title}
          <span className="lib-card__ext">.{file.ext}</span>
        </span>
        {file.favourite ? <FavouriteTag className="lib-card__fav" /> : null}
      </Link>
      <div className="lib-card__foot">
        <span className="lib-card__meta">
          {titleHasModule(file) ? null : <span className="lib-card__code">{moduleTag(file)}</span>}
          {cardMeta(file, sort)}
        </span>
        <StarButton on={starred} onToggle={onToggleStar} title={file.title} className="lib-card__star" />
      </div>
    </article>
  );
}
