// A finished play in squares, in the hub's own colours: The Word's rows, Correlations' tries, Data Mine's finds, The
// Daily Query's answers, Nearest Neighbour's way to the word and Sudoku's boxes. It takes the size of its box, and
// is decorative: the words beside it say how the play went. The emoji grid is only for the text a player shares.
import { cx } from '../../../ui';
import type { Picture } from '../types';

const SQUARE = 10;
const GAP = 2.5;

/** `square`: a square's side in pixels; the picture shrinks to fit a smaller box. */
export function PlayPicture({
  picture,
  square = 14,
  className,
}: {
  picture: Picture;
  square?: number;
  className?: string;
}) {
  const cols = Math.max(...picture.map((row) => row.length));
  const step = SQUARE + GAP;
  const width = cols * step - GAP;
  const height = picture.length * step - GAP;
  const scale = square / SQUARE;
  return (
    <svg
      className={cx('dy-pic', className)}
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      aria-hidden="true"
      focusable="false"
    >
      {picture.flatMap((row, r) =>
        row.map((mark, c) => (
          <rect
            key={`${r}-${c}`}
            className={`is-${mark}`}
            x={c * step}
            y={r * step}
            width={SQUARE}
            height={SQUARE}
            rx={2.2}
          />
        )),
      )}
    </svg>
  );
}
