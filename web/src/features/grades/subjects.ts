// Display data for the subjects: names and unit codes from the module catalogue, plus the choices a student makes
// (their Year 2 option and two Year 3 electives, as the rules list them). Labels only: the classification never
// depends on these choices.
import type { GradeOption, ModuleSummary } from '../../api/types';
import { subjectsOf, type ChoiceSlot, type Picks, type Rules, type Subject } from './classify';

type ModuleLookup = (id: string | null | undefined) => ModuleSummary | null;

const optionsFor = (choice: ChoiceSlot, rules: Rules): GradeOption[] =>
  choice === 'year2Option' ? rules.year2Options : rules.electives;
const optionLabel = (o: GradeOption, getModule: ModuleLookup): string =>
  o.moduleId ? (getModule(o.moduleId)?.name ?? o.label ?? o.id) : (o.label ?? o.id);

/** Select options for a choice slot, given the picks so far (an elective can't be picked twice). */
export function choiceOptions(
  choice: ChoiceSlot,
  picks: Picks,
  getModule: ModuleLookup,
  rules: Rules,
): { value: string; label: string }[] {
  if (choice === 'year2Option')
    return rules.year2Options.map((o) => ({ value: o.id, label: optionLabel(o, getModule) }));
  const other = choice === 'elective1' ? picks.elective2 : picks.elective1;
  return rules.electives.filter((o) => o.id !== other).map((o) => ({ value: o.id, label: optionLabel(o, getModule) }));
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
export function subjectDisplay(subject: Subject, picks: Picks, getModule: ModuleLookup, rules: Rules): SubjectDisplay {
  if (subject.choice) {
    const pick = picks[subject.choice];
    const opt = optionsFor(subject.choice, rules).find((o) => o.id === pick);
    if (opt) {
      const m = opt.moduleId ? getModule(opt.moduleId) : null;
      const label = opt.label ?? opt.id;
      return {
        code: m?.unitCode ?? null,
        name: m ? m.name : label,
        short: m ? m.shortName : label,
        moduleId: m?.id ?? null,
        placeholder: false,
      };
    }
    return { code: null, name: subject.name, short: subject.name, moduleId: null, placeholder: true };
  }
  const m = getModule(subject.moduleId);
  return {
    code: m?.unitCode ?? null,
    name: m ? m.name : subject.name,
    short: m ? m.shortName : subject.name,
    moduleId: m?.id ?? null,
    placeholder: false,
  };
}

/** Rows grouped by year, in subject order; years without subjects are left out. */
export function yearsOf(rules: Rules): { year: 1 | 2 | 3; subjects: Subject[] }[] {
  const all = subjectsOf(rules);
  return ([1, 2, 3] as const)
    .map((year) => ({ year, subjects: all.filter((s) => s.year === year) }))
    .filter((y) => y.subjects.length > 0);
}

/**
 * The calculator's choices filled from the student's papers where the calculator has none of its own:
 * the option, and both electives together.
 */
export function withPaperPicks(picks: Picks, papers: readonly string[], rules: Rules): Picks {
  const out: Picks = { ...picks };
  // A paper is a module id, or a choice's own id when the Hub has no module for it ('abstract-maths').
  const picked = (o: GradeOption) => papers.includes(o.moduleId ?? o.id);
  const option = rules.year2Options.find(picked);
  if (!out.year2Option && option) out.year2Option = option.id;
  const electives = rules.electives.filter(picked).map((o) => o.id);
  if (!out.elective1 && !out.elective2) {
    if (electives[0]) out.elective1 = electives[0];
    if (electives[1]) out.elective2 = electives[1];
  }
  return out;
}
