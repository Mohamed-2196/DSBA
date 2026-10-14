// Display data for the 13 subjects: names and unit codes from the module catalogue, plus the choices a
// student makes (their Year 2 option and two Year 3 electives). Labels only: the classification never
// depends on these choices.
import type { ModuleSummary } from '../../api/types';
import { SUBJECTS, type ChoiceSlot, type Picks, type Subject } from './classify';

type ModuleLookup = (id: string | null | undefined) => ModuleSummary | null;

interface Option {
  value: string;
  moduleId: string | null;
  label?: string;
}

/** The "Abstract Mathematics/Information Systems/Econometrics" slot. Abstract Mathematics has no module page (and no unit code). */
export const YEAR2_OPTIONS: Option[] = [
  { value: 'econometrics', moduleId: 'econometrics' },
  { value: 'information-systems', moduleId: 'information-systems' },
  { value: 'abstract-maths', label: 'Abstract Mathematics', moduleId: null },
];
/** The Year 3 electives: modules on DSBA Hub that aren't compulsory. */
export const ELECTIVE_OPTIONS: Option[] = ['microeconomics', 'asset-pricing', 'marketing-management', 'further-maths-economists'].map((id) => ({ value: id, moduleId: id }));

const optionLabel = (o: Option, getModule: ModuleLookup): string => (o.moduleId ? (getModule(o.moduleId)?.name ?? o.value) : (o.label ?? o.value));

/** Select options for a choice slot, given the picks so far (an elective can't be picked twice). */
export function choiceOptions(choice: ChoiceSlot, picks: Picks, getModule: ModuleLookup): { value: string; label: string }[] {
  if (choice === 'year2Option') return YEAR2_OPTIONS.map((o) => ({ value: o.value, label: optionLabel(o, getModule) }));
  const other = choice === 'elective1' ? picks.elective2 : picks.elective1;
  return ELECTIVE_OPTIONS.filter((o) => o.value !== other).map((o) => ({ value: o.value, label: optionLabel(o, getModule) }));
}

export interface SubjectDisplay {
  code: string | null;
  name: string;
  short: string;
  moduleId: string | null;
  /** A choice slot that hasn't been picked yet. */
  placeholder: boolean;
}

/** What a row shows. */
export function subjectDisplay(subject: Subject, picks: Picks, getModule: ModuleLookup): SubjectDisplay {
  if (subject.choice) {
    const pick = picks[subject.choice];
    const pool = subject.choice === 'year2Option' ? YEAR2_OPTIONS : ELECTIVE_OPTIONS;
    const opt = pool.find((o) => o.value === pick);
    if (opt) {
      const m = opt.moduleId ? getModule(opt.moduleId) : null;
      const label = opt.label ?? opt.value;
      return { code: m?.unitCode ?? null, name: m ? m.name : label, short: m ? m.shortName : label, moduleId: m?.id ?? null, placeholder: false };
    }
    const name = subject.choice === 'year2Option' ? 'Year 2 option' : subject.choice === 'elective1' ? 'Elective 1' : 'Elective 2';
    return { code: null, name, short: name, moduleId: null, placeholder: true };
  }
  const m = getModule(subject.moduleId);
  return { code: m?.unitCode ?? null, name: m ? m.name : subject.name, short: m ? m.shortName : subject.name, moduleId: m?.id ?? null, placeholder: false };
}

/** Rows grouped by year, in subject order. */
export const YEARS: { year: 1 | 2 | 3; subjects: Subject[] }[] = ([1, 2, 3] as const).map((year) => ({ year, subjects: SUBJECTS.filter((s) => s.year === year) }));

/**
 * The calculator's choices filled from the student's papers (IDEA-10) where the calculator has none of its own:
 * the option, and both electives together.
 */
export function withPaperPicks(picks: Picks, papers: readonly string[]): Picks {
  const out: Picks = { ...picks };
  const option = YEAR2_OPTIONS.find((o) => papers.includes(o.value));
  if (!out.year2Option && option) out.year2Option = option.value;
  const electives = ELECTIVE_OPTIONS.filter((o) => papers.includes(o.value)).map((o) => o.value);
  if (!out.elective1 && !out.elective2) {
    if (electives[0]) out.elective1 = electives[0];
    if (electives[1]) out.elective2 = electives[1];
  }
  return out;
}
