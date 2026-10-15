import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretLeft, CaretRight, CheckCircle } from '@phosphor-icons/react';
import { useDailyCalendar } from '../api';

export function CalendarArchiveView() {
  const currentMonthStr = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const [month, setMonth] = useState(currentMonthStr);

  const { data: calData, isLoading } = useDailyCalendar(month);

  const handlePrevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setMonth(prev.toISOString().slice(0, 7));
  };

  const handleNextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const next = new Date(y, m, 1);
    const nextStr = next.toISOString().slice(0, 7);
    if (nextStr <= currentMonthStr) {
      setMonth(nextStr);
    }
  };

  const monthTitle = new Date(`${month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const days = calData?.days ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-20)' }}>
      {/* Month Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--sp-8)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--fs-20)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
          {monthTitle}
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="chip"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--r-control)',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--surface)',
              cursor: 'pointer',
            }}
            onClick={handlePrevMonth}
            aria-label="Previous Month"
          >
            <CaretLeft size={16} />
          </button>
          <button
            type="button"
            className="chip"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--r-control)',
              border: '1px solid var(--line)',
              backgroundColor: 'var(--surface)',
              cursor: month >= currentMonthStr ? 'not-allowed' : 'pointer',
              opacity: month >= currentMonthStr ? 0.4 : 1,
            }}
            onClick={handleNextMonth}
            disabled={month >= currentMonthStr}
            aria-label="Next Month"
          >
            <CaretRight size={16} />
          </button>
        </div>
      </div>

      {/* Info notice about archive */}
      <div style={{ padding: 'var(--sp-12) var(--sp-16)', borderRadius: 'var(--r-control)', backgroundColor: 'var(--surface-2)', border: '1px solid var(--line)', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
        Archive days are available for unlimited practice. Points and streak progression apply to today&apos;s puzzles only.
      </div>

      {/* Days Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 'var(--sp-12)',
        }}
      >
        {isLoading ? (
          <div style={{ gridColumn: '1 / -1', padding: 'var(--sp-32)', textAlign: 'center', color: 'var(--ink-2)' }}>
            Loading archive calendar...
          </div>
        ) : days.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: 'var(--sp-32)', textAlign: 'center', color: 'var(--ink-2)' }}>
            No past puzzles for this month.
          </div>
        ) : (
          days.map((d) => {
            const isFinishedAll = d.done >= (calData?.total ?? 6);
            return (
              <div
                key={d.day}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: 'var(--sp-12)',
                  borderRadius: 'var(--r-control)',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--line)',
                  minHeight: '110px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--fs-16)', fontWeight: 'var(--fw-bold)', color: 'var(--ink)' }}>
                      {d.day.slice(-2)}
                    </span>
                    {isFinishedAll && (
                      <CheckCircle size={16} color="var(--signal)" weight="fill" />
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-2)', marginTop: '4px' }}>
                    {d.theme}
                  </div>
                </div>

                <div style={{ marginTop: 'var(--sp-8)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                    {d.done}/{calData?.total ?? 6} done
                  </div>
                  <Link
                    to={`/daily/${d.day}/word`}
                    style={{
                      fontSize: 'var(--fs-12)',
                      fontWeight: 'var(--fw-semibold)',
                      color: 'var(--cobalt)',
                      textDecoration: 'none',
                    }}
                  >
                    Play
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
