// Your modules and exam zone, wherever they are kept: on the account when signed in, in this browser for a guest.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api, call } from '../../api/client';
import { ME_KEY, useAuth } from '../../auth';
import { normalizeYear, useLocalStorage, useYear, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { isZone, type Zone } from '../../lib/exams';
import { usePaperChoices } from './api';
import { choicesFrom, cleanPicks, papersFor, type Choices } from './papers';

const GUEST_KEY = 'hub.papers';

interface Stored {
  papers: string[];
  zone: Zone | null;
}

const cleanZone = (raw: unknown): Zone | null => (isZone(raw) ? raw : null);

export interface PapersValue {
  /** what was picked (module ids, and 'abstract-maths') */
  picks: string[];
  zone: Zone | null;
  /** the student's own year: the account's, or the one a guest chose */
  home: CohortYear | null;
  /** the browsed year */
  year: CohortYear | null;
  /** the module ids sat in the browsed year; null: all its modules */
  papers: Set<string> | null;
  /** the choices inside each year (the Year 2 option, the electives) */
  choices: Choices;
  save: (next: Stored) => Promise<void>;
  saving: boolean;
}

export function usePapers(): PapersValue {
  const { me } = useAuth();
  const { year } = useYear();
  const { modules } = useModules();
  const served = usePaperChoices().data;
  const choices = useMemo(() => choicesFrom(served), [served]);
  const qc = useQueryClient();
  const [stored, setStored] = useLocalStorage<unknown>(GUEST_KEY, null);
  const update = useMutation({
    mutationFn: (body: Stored) => call(api.PATCH('/api/v1/me', { body })),
    onSuccess: (next) => qc.setQueryData(ME_KEY, next),
  });

  const guest = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const picks = useMemo(() => (me ? me.papers : cleanPicks(guest.papers)), [me, guest.papers]);
  const zone = me ? (me.zone ?? null) : cleanZone(guest.zone);
  const home = me ? normalizeYear(me.year) : year;
  const papers = useMemo(() => papersFor(year, home, picks, modules, choices), [year, home, picks, modules, choices]);

  const { mutateAsync } = update;
  const save = useCallback(
    async (next: Stored) => {
      if (me) await mutateAsync(next);
      else setStored({ papers: cleanPicks(next.papers), zone: next.zone });
    },
    [me, mutateAsync, setStored],
  );

  return { picks, zone, home, year, papers, choices, save, saving: update.isPending };
}
