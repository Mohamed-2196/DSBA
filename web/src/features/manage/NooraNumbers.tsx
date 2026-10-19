// Manage's numbers for Mini Noora's AI answers: questions and estimated cost today and this month, against the
// limits. Admins change the limits here. Only totals: nothing about any one student.
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/errors';
import type { NooraUsageOut } from '../../api/types';
import { useToast } from '../../state';
import { Button, Panel, QueryError, Skeleton, TextField, formatCount } from '../../ui';
import { useNooraUsage, useSetNooraLimits } from './api';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function LimitsForm({ usage }: { usage: NooraUsageOut }) {
  const set = useSetNooraLimits();
  const { push } = useToast();
  const [daily, setDaily] = useState(String(usage.dailyQuestions));
  const [budget, setBudget] = useState((usage.monthlyBudgetCents / 100).toFixed(2));
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const dailyQuestions = Number(daily);
    const monthlyBudgetCents = Math.round(Number(budget) * 100);
    if (!Number.isInteger(dailyQuestions) || dailyQuestions < 0 || dailyQuestions > 500) {
      setProblem('Questions a day: a whole number from 0 to 500.');
      return;
    }
    if (!Number.isFinite(monthlyBudgetCents) || monthlyBudgetCents < 0 || monthlyBudgetCents > 1_000_000) {
      setProblem('Monthly budget: an amount from $0 to $10,000.');
      return;
    }
    setProblem(null);
    set.mutate(
      { dailyQuestions, monthlyBudgetCents },
      {
        onSuccess: () => push({ tone: 'success', title: 'Mini Noora’s limits are saved' }),
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };
  return (
    <form className="manage-noora__form" onSubmit={submit} data-hub="noora-limits">
      <TextField
        label="Questions per student a day"
        hint="Set it to 0 to pause her AI answers."
        type="number"
        inputMode="numeric"
        min={0}
        max={500}
        value={daily}
        onChange={(e) => setDaily(e.target.value)}
      />
      <TextField
        label="Monthly budget (US$)"
        hint="Estimated from the tokens she uses. Over it, she answers from her script."
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
      />
      <div className="manage-noora__save">
        <Button type="submit" variant="primary" loading={set.isPending}>
          Save limits
        </Button>
        {problem ? (
          <p className="manage-noora__problem" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function NooraNumbers({ canEdit }: { canEdit: boolean }) {
  const usage = useNooraUsage(true);
  if (usage.isError)
    return (
      <QueryError
        error={usage.error}
        title="Mini Noora’s numbers didn’t load"
        onRetry={() => void usage.refetch()}
        retrying={usage.isFetching}
        size="sm"
      />
    );
  const u = usage.data;
  const numbers: [string, string | null][] = [
    ['AI questions today', u ? formatCount(u.today.questions) : null],
    ['Students asking today', u ? formatCount(u.today.students) : null],
    ['AI questions this month', u ? formatCount(u.month.questions) : null],
    ['Spent this month (estimate)', u ? `${dollars(u.month.costCents)} of ${dollars(u.monthlyBudgetCents)}` : null],
  ];
  return (
    <Panel className="manage-noora" data-hub="noora-usage">
      <h3 className="manage-noora__title">Mini Noora’s AI answers</h3>
      <p className="manage-noora__note">
        {u && !u.configured ? 'No Claude key is set on the server, so she answers from her script. ' : ''}
        Only totals are kept: no questions, notes or answers.
      </p>
      <dl className="manage-numbers" aria-busy={usage.isPending || undefined}>
        {numbers.map(([label, value]) => (
          <div key={label} className="manage-number">
            <dt>{label}</dt>
            <dd>{value ?? <Skeleton width="2.5ch" height="1em" />}</dd>
          </div>
        ))}
      </dl>
      {u && canEdit ? <LimitsForm usage={u} /> : null}
      {u && !canEdit ? (
        <p className="manage-noora__note">
          Each student may ask {formatCount(u.dailyQuestions)} questions a day. Admins change the limits.
        </p>
      ) : null}
    </Panel>
  );
}
