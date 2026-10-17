// One sheet's ink, drawn as SVG in the sheet's own units: crisp at any zoom (the page around it is scaled), and the
// same paths print and export as vectors. Strokes may run past the sheet's edge and still show.
import { memo } from 'react';
import { strokePath, unionBounds, type InkStroke } from './geometry';
import './ink.css';

const paths = new WeakMap<InkStroke, string>();

/** A stroke's path, worked out once per stroke (strokes are never changed in place). */
function cachedPath(stroke: InkStroke): string {
  let d = paths.get(stroke);
  if (d === undefined) {
    d = strokePath(stroke);
    paths.set(stroke, d);
  }
  return d;
}

export const StrokePaths = memo(function StrokePaths({ strokes }: { strokes: readonly InkStroke[] }) {
  return (
    <>
      {strokes.map((s) => (
        <path key={s.id} d={cachedPath(s)} fill={s.color} className={s.tool === 'highlighter' ? 'ink-highlighter' : undefined} />
      ))}
    </>
  );
});

export interface InkSheetProps {
  strokes: readonly InkStroke[];
  /** the sheet's size in its own units */
  width: number;
  height: number;
  /** strokes picked with the lasso, and how far they are being dragged (units) */
  selected?: ReadonlySet<string>;
  offset?: { dx: number; dy: number } | null;
  className?: string;
}

export function InkSheet({ strokes, width, height, selected, offset, className }: InkSheetProps) {
  const hasSelection = !!selected?.size;
  const resting = hasSelection ? strokes.filter((s) => !selected.has(s.id)) : strokes;
  const picked = hasSelection ? strokes.filter((s) => selected.has(s.id)) : [];
  const box = hasSelection ? unionBounds(picked) : null;
  const shift = offset ? `translate(${offset.dx} ${offset.dy})` : undefined;
  return (
    <svg
      className={className ? `ink-sheet ${className}` : 'ink-sheet'}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      <StrokePaths strokes={resting} />
      {picked.length ? (
        <g transform={shift}>
          <StrokePaths strokes={picked} />
          {box ? (
            <rect
              className="ink-selection"
              x={box.x - 6}
              y={box.y - 6}
              width={box.w + 12}
              height={box.h + 12}
              rx={6}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}
