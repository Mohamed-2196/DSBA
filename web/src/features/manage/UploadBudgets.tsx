// Manage's upload budgets (admins only): how much the whole hub, and each account, may upload in 24 hours, and how
// much uploads took in the last 24 hours. Uploads over either budget wait until enough of the day has passed.
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/errors';
import type { UploadLimitsOut } from '../../api/types';
import { useToast } from '../../state';
import { Button, Panel, QueryError, Skeleton, WholeNumberField } from '../../ui';
import { useSetUploadLimits, useUploadLimits } from './api';
import { formatStorage, usedPercent } from './storageWords';

const MB = 1024 * 1024;
const HUB_GB_MIN = 1;
const HUB_GB_MAX = 1024;
const ACCOUNT_MB_MIN = 10;
const ACCOUNT_MB_MAX = 100 * 1024;

function BudgetForm({ limits }: { limits: UploadLimitsOut }) {
  const set = useSetUploadLimits();
  const { push } = useToast();
  const savedHubGb = Math.max(HUB_GB_MIN, Math.round(limits.hubMbPerDay / 1024));
  const [hubGb, setHubGb] = useState(savedHubGb);
  const [accountMb, setAccountMb] = useState(limits.accountMbPerDay);
  const [problem, setProblem] = useState<string | null>(null);
  const unchanged = hubGb === savedHubGb && accountMb === limits.accountMbPerDay;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    set.mutate(
      { hubMbPerDay: hubGb * 1024, accountMbPerDay: accountMb },
      {
        onSuccess: () => push({ tone: 'success', title: 'The upload budgets are saved' }),
        onError: (err) => setProblem(errorMessage(err)),
      },
    );
  };
  return (
    <form className="manage-noora__form" onSubmit={submit} data-hub="upload-budgets">
      <WholeNumberField
        label="Whole hub, GB a day"
        hint="Every upload together in 24 hours: library, forum, boards, notes and the rest."
        min={HUB_GB_MIN}
        max={HUB_GB_MAX}
        value={hubGb}
        onValue={setHubGb}
      />
      <WholeNumberField
        label="Each account, MB a day"
        hint="One person’s uploads in 24 hours. 1024 MB is 1 GB."
        min={ACCOUNT_MB_MIN}
        max={ACCOUNT_MB_MAX}
        value={accountMb}
        onValue={setAccountMb}
      />
      <div className="manage-noora__save">
        <Button type="submit" variant="primary" loading={set.isPending} disabled={unchanged}>
          Save budgets
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

export function UploadBudgets() {
  const limits = useUploadLimits(true);
  if (limits.isError)
    return (
      <QueryError
        error={limits.error}
        title="The upload budgets didn’t load"
        onRetry={() => void limits.refetch()}
        retrying={limits.isFetching}
        size="sm"
      />
    );
  const l = limits.data;
  const label = 'Uploaded in the last 24 hours';
  const percent = l ? usedPercent(l.bytesLastDay, l.hubMbPerDay * MB) : 0;
  return (
    <Panel className="manage-noora" data-hub="upload-limits">
      <h3 className="manage-noora__title">Upload budgets</h3>
      <p className="manage-noora__note">
        Over a budget, uploads wait until enough of the last 24 hours has passed, and the person is told how long.
      </p>
      {l ? (
        <>
          <div className="manage-storage">
            <p className="manage-storage__line">
              {label}: <strong>{formatStorage(l.bytesLastDay)}</strong> of {formatStorage(l.hubMbPerDay * MB)}
            </p>
            <div
              className="manage-storage__meter"
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`${percent}% used`}
            >
              <div className="manage-storage__fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <BudgetForm key={`${l.hubMbPerDay}-${l.accountMbPerDay}`} limits={l} />
        </>
      ) : (
        <Skeleton width="100%" height="4rem" />
      )}
    </Panel>
  );
}
