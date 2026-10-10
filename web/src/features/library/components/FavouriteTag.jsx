import { Heart } from '@phosphor-icons/react';
import { Badge, cx } from '../../../ui';

/** The small label on files the cohort keeps coming back to ("Student favourites"). */
export function FavouriteTag({ size = 'sm', className }) {
  return (
    <Badge tone="cobalt" size={size} icon={<Heart weight="fill" />} className={cx('lib-fav', className)}>
      Student favourite
    </Badge>
  );
}
