// A chapter's study-guide topics as filter chips, each with its question count: "All", the topics in the guide's
// order, then "Other". One row that scrolls sideways on phones, its cut edge fading; wraps where there is room.
import { useRef } from 'react';
import { Chip, cx, useScrollFade } from '../../../ui';
import type { TopicGroup } from '../topics';
import './TopicChips.css';

export function TopicChips({
  groups,
  total,
  value,
  onChange,
  label = 'Filter by topic',
  className,
}: {
  groups: readonly TopicGroup[];
  /** the chapter's questions, each once */
  total: number;
  /** the chosen topic; null: every question */
  value: string | null;
  onChange: (topic: string | null) => void;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollFade(ref, null, `${groups.length}-${value ?? ''}`);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cx('lib-topics', 'u-scroll-row', 'u-scroll-row--bleed', className)}
      data-hub="topic-chips"
    >
      <Chip size="sm" selected={value === null} count={total} onChange={() => onChange(null)} data-topic-id="">
        All
      </Chip>
      {groups.map((g) => (
        <Chip
          key={g.id}
          size="sm"
          selected={value === g.id}
          count={g.questions.length}
          onChange={(next) => onChange(next ? g.id : null)}
          data-topic-id={g.id}
          title={g.title}
        >
          {g.title}
        </Chip>
      ))}
    </div>
  );
}
