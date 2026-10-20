// "I'm resitting this" on a module's page (signed in): the module's resits then count down for the student whatever
// their year, on Home, the calendar and this page. Kept on the account (PATCH /me resits).
import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { usePapers } from '../papers/public';

export function ResitToggle({ moduleId }: { moduleId: string }) {
  const { me } = useAuth();
  const { resits, setResit } = usePapers();
  const { push } = useToast();
  const [saving, setSaving] = useState(false);
  if (!me) return null;
  const on = resits.has(moduleId);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      await setResit(moduleId, next);
    } catch (e) {
      push({ tone: 'alert', title: 'That wasn’t saved', body: errorMessage(e, 'Try again in a moment.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="mod-head__resit-toggle" data-hub="module-resitting">
      <input type="checkbox" checked={on} disabled={saving} onChange={(e) => void toggle(e.target.checked)} />
      <span>I’m resitting this</span>
    </label>
  );
}
