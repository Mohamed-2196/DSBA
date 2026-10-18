// Manage's Sunday summary: this week's text for a year, to paste into its WhatsApp group, and how many people in
// that year get it by email. The mail worker sends the emails on Sunday at the words' send time by itself; nothing is
// sent here.
import { Copy } from '@phosphor-icons/react';
import { useState } from 'react';
import { formatLong, parseDay } from '../../lib/dates';
import { copyText } from '../../lib/share';
import { cohortLabel, useToast, YEARS, type CohortYear } from '../../state';
import { Button, Panel, QueryError, SegmentedControl, Skeleton, formatCount } from '../../ui';
import { useSummaryPreview, useSummaryWords } from './api';

export function SundaySummary({ defaultYear }: { defaultYear: CohortYear | null }) {
  const [year, setYear] = useState<CohortYear>(defaultYear ?? 1);
  const preview = useSummaryPreview(year);
  const sendAt = useSummaryWords().data?.data.sendAt;
  const { push } = useToast();
  const p = preview.data;
  const copy = async () => {
    if (!p) return;
    const ok = await copyText(p.text);
    push(
      ok
        ? { tone: 'success', title: 'Copied. Paste it into the group.' }
        : { tone: 'alert', title: 'It wasn’t copied', body: 'Select the text and copy it yourself.' },
    );
  };
  return (
    <Panel className="manage-summary" data-hub="sunday-summary">
      <h3 className="manage-noora__title">Sunday summary</h3>
      <p className="manage-noora__note">
        This week’s summary for a year, to paste into its group. People who turn it on in Your account get it by email
        on Sunday{sendAt ? ` from ${sendAt}, Bahrain time` : ''}.
      </p>
      <SegmentedControl
        label="Year"
        options={YEARS.map((y) => ({ value: y, label: cohortLabel(y) }))}
        value={year}
        onChange={setYear}
        size="sm"
      />
      {preview.isError ? (
        <QueryError
          error={preview.error}
          title="The summary didn’t load"
          onRetry={() => void preview.refetch()}
          retrying={preview.isFetching}
          size="sm"
        />
      ) : !p ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <p className="manage-noora__note">
            Week of {formatLong(parseDay(p.weekOf))}.{' '}
            {p.subscribers === 1 ? '1 person' : `${formatCount(p.subscribers)} people`} in {cohortLabel(p.year)} get it
            by email.
            {p.empty ? ' Nothing to tell this week, so no email goes out.' : ''}
          </p>
          <pre className="manage-summary__text" tabIndex={0} aria-label={`The summary for ${cohortLabel(p.year)}`}>
            {p.text}
          </pre>
          <div>
            <Button variant="primary" leadingIcon={Copy} onClick={() => void copy()} disabled={p.empty}>
              Copy the text
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
