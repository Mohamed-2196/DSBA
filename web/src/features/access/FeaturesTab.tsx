// Each feature's switch: off, on for some roles, or on for everyone. Admins see every feature whatever its switch, so
// Admin isn't among the roles to pick.
import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { FeatureOut } from '../../api/types';
import { useToast } from '../../state';
import { Panel, QueryError, SegmentedControl, Skeleton } from '../../ui';
import { useFeatureSwitches, useRoleCatalogue, useSetSwitch } from './api';
import { switchBody, switchSummary, type SwitchMode } from './switches';

const MODES: { value: SwitchMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'roles', label: 'Some roles' },
  { value: 'everyone', label: 'Everyone' },
];

type RoleChoice = { id: string; name: string };

function FeatureRow({ f, roles }: { f: FeatureOut; roles: RoleChoice[] }) {
  const set = useSetSwitch();
  const { push } = useToast();
  const [mode, setMode] = useState<SwitchMode>(f.mode);
  const [picked, setPicked] = useState<Set<string>>(new Set(f.roleIds));
  const [problem, setProblem] = useState<string | null>(null);
  // Follow the saved switch (a refetch, another admin's change) whenever no save of ours is in flight.
  const saved = `${f.mode}:${[...f.roleIds].sort().join(',')}`;
  const [shown, setShown] = useState(saved);
  if (saved !== shown && !set.isPending) {
    setShown(saved);
    setMode(f.mode);
    setPicked(new Set(f.roleIds));
  }
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? null;
  const send = (nextMode: SwitchMode, ids: Set<string>) => {
    if (set.isPending) return; // one save at a time, so each answer lands on its own change
    setProblem(null);
    // "Some roles" with none picked waits: the API refuses an empty list.
    if (nextMode === 'roles' && ids.size === 0) return;
    set.mutate(
      { feature: f.feature, body: switchBody(nextMode, [...ids]) },
      {
        onSuccess: (out) => push({ tone: 'success', title: `${out.label}: ${switchSummary(out, roleName).toLowerCase()}` }),
        onError: (e) => {
          setProblem(errorMessage(e));
          // Show what's saved again.
          setMode(f.mode);
          setPicked(new Set(f.roleIds));
        },
      },
    );
  };
  const noneYet = mode === 'roles' && picked.size === 0;
  return (
    <li className="access-feature">
      <div className="access-feature__text">
        <h3>{f.label}</h3>
        <p>Switching it off hides: {f.hides}</p>
      </div>
      <fieldset className="access-switch" disabled={set.isPending}>
        <SegmentedControl
          label={`${f.label}: who sees it`}
          options={MODES}
          value={mode}
          onChange={(m) => {
            if (set.isPending) return;
            setMode(m);
            send(m, picked);
          }}
        />
      </fieldset>
      {mode === 'roles' ? (
        <fieldset className="access-area" disabled={set.isPending}>
          <legend>Which roles</legend>
          {roles.map((r) => (
            <label key={r.id} className="access-box">
              <input
                type="checkbox"
                checked={picked.has(r.id)}
                onChange={() => {
                  if (set.isPending) return;
                  const next = new Set(picked);
                  if (next.has(r.id)) next.delete(r.id);
                  else next.add(r.id);
                  setPicked(next);
                  send('roles', next);
                }}
              />
              <span>{r.name}</span>
            </label>
          ))}
          {noneYet ? <p className="access-note">Pick at least one role. Until you do, it stays {switchSummary(f, roleName).toLowerCase()}.</p> : null}
        </fieldset>
      ) : null}
      {problem ? (
        <p className="access-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

export function FeaturesTab() {
  const switches = useFeatureSwitches();
  const catalogue = useRoleCatalogue();
  if (switches.isPending || catalogue.isPending) return <Skeleton lines={8} />;
  if (switches.isError) return <QueryError error={switches.error} title="The switches didn’t load" onRetry={() => void switches.refetch()} retrying={switches.isFetching} />;
  if (catalogue.isError) return <QueryError error={catalogue.error} title="The roles didn’t load" onRetry={() => void catalogue.refetch()} retrying={catalogue.isFetching} />;
  const roles = catalogue.data.roles.filter((r) => !r.locked).map((r) => ({ id: r.id, name: r.name }));
  return (
    <Panel padding="none">
      <ul role="list" className="access-features">
        {switches.data.map((f) => (
          <FeatureRow key={f.feature} f={f} roles={roles} />
        ))}
      </ul>
    </Panel>
  );
}
