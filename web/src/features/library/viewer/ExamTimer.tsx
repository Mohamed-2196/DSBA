// "Time me": a 1, 2 or 3 hour countdown over a past paper, then the examiners' report.
import { Timer, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryItem } from '../../../api/types';
import { Button, IconButton, Menu } from '../../../ui';
import { itemPath } from '../api';
import { clockLabel } from '../papers';

const EXAM_HOURS = [1, 2, 3] as const;

/** The toolbar's button: pick how long the paper takes. */
export function TimeMeButton({ onStart, compact }: { onStart: (hours: number) => void; compact: boolean }) {
  const items = EXAM_HOURS.map((h) => ({ id: `h${h}`, label: h === 1 ? '1 hour' : `${h} hours`, onSelect: () => onStart(h) }));
  return (
    <Menu
      align="end"
      label="Time me"
      items={items}
      trigger={compact ? <IconButton label="Time me" icon={Timer} /> : <Button leadingIcon={Timer}>Time me</Button>}
    />
  );
}

/** The countdown under the toolbar, and the report once time is up. */
export function ExamTimer({ endsAt, report, onStop }: { endsAt: number; report: LibraryItem | null; onStop: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const left = endsAt - now;
  const done = left <= 0;
  useEffect(() => {
    if (done) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [done]);
  return (
    <div className="lib-timer" role={done ? 'alert' : 'timer'} aria-live={done ? 'assertive' : 'off'} data-hub="exam-timer">
      <Timer aria-hidden="true" weight="duotone" className="lib-timer__icon" />
      {done ? (
        <p className="lib-timer__text">
          <strong>Time’s up.</strong>{' '}
          {report ? (
            <>
              Check your answers against <Link to={itemPath(report)}>the examiners’ report</Link>.
            </>
          ) : (
            'Put your pen down and check your answers.'
          )}
        </p>
      ) : (
        <p className="lib-timer__text">
          <strong className="lib-timer__clock u-tabular" aria-label={`${clockLabel(left)} left`}>
            {clockLabel(left)}
          </strong>{' '}
          left
        </p>
      )}
      <IconButton label={done ? 'Close' : 'Stop the timer'} icon={X} size="sm" onClick={onStop} />
    </div>
  );
}
