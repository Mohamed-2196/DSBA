// Career Navigator: how well a student's modules cover a role. Pure functions over the career document's skills
// and the module catalogue, so the numbers can never drift from either.
import type { ModuleSummary } from '../../../api/types';
import type { CareerData, Depth, Role, Skill } from '../types';

type ModuleLookup = (id: string | null | undefined) => ModuleSummary | null;

export type SkillStatus = 'covered' | 'later' | 'gap';

export interface Teaching {
  module: string;
  depth: Depth;
  what: string;
  mod: ModuleSummary;
  chosen: string | null;
}

export interface SkillFit {
  id: string;
  skill: Skill;
  status: SkillStatus;
  /** Meter segments out of 3: reached so far, and added by later years. */
  solid: number;
  ghost: number;
  total: number;
  /** The year a "later" skill first arrives. */
  from: number | null;
  /** The modules worth naming in the row, strongest first. */
  named: Teaching[];
  detail: string;
  label: string;
}

export interface RoleFitResult {
  rows: SkillFit[];
  covered: SkillFit[];
  later: SkillFit[];
  gaps: SkillFit[];
  total: number;
}

const bestDepth = (list: readonly Teaching[]): number => list.reduce((m, t) => Math.max(m, t.depth), 0);

/**
 * One skill, seen by a student who has reached `year` (1|2|3): modules up to and including that year count.
 *   covered: the modules so far take it to a solid grounding (depth 2) or better.
 *   later:   they don't yet, but a later year does.
 *   gap:     DSBA never takes it past an intro: it is yours to close.
 */
export function evaluateSkill(data: CareerData, getModule: ModuleLookup, skillId: string, year: number): SkillFit | null {
  const skill = data.skills[skillId];
  if (!skill) return null;
  const taught: Teaching[] = [];
  for (const t of skill.taught) {
    const mod = getModule(t.module);
    if (mod) taught.push({ ...t, mod, chosen: data.chosen[t.module] ?? null });
  }
  const soFar = taught.filter((t) => t.mod.year <= year);
  const ahead = taught.filter((t) => t.mod.year > year);
  const solid = bestDepth(soFar);
  const total = bestDepth(taught);
  const status: SkillStatus = total < 2 ? 'gap' : solid >= 2 ? 'covered' : 'later';

  // The modules worth naming in the row, strongest first (earliest year breaks a tie).
  const strongest = (list: Teaching[]) => [...list].sort((a, b) => b.depth - a.depth || a.mod.year - b.mod.year);
  let named: Teaching[];
  let detail = skill.gapNote ?? '';
  if (status === 'covered') {
    named = strongest(soFar.filter((t) => t.depth >= 2));
    detail = named[0]?.what || detail;
  } else if (status === 'later') {
    named = strongest(ahead.filter((t) => t.depth >= 2));
    detail = named[0]?.what || detail;
  } else {
    named = strongest(taught.filter((t) => t.depth >= 1));
  }

  const from = status === 'later' && named.length ? Math.min(...named.map((t) => t.mod.year)) : null;
  const label = from ? `From Year ${from}` : (data.depthLabel[String(status === 'gap' ? total : solid)] ?? '');

  return { id: skillId, skill, status, solid, ghost: total - solid, total, from, named: named.slice(0, 2), detail, label };
}

/** Every skill of a role for a year, with the three headline counts. */
export function evaluateRole(data: CareerData, getModule: ModuleLookup, role: Role, year: number): RoleFitResult {
  const rows = role.skills.map((id) => evaluateSkill(data, getModule, id, year)).filter((r): r is SkillFit => r !== null);
  const by = (status: SkillStatus) => rows.filter((r) => r.status === status);
  return { rows, covered: by('covered'), later: by('later'), gaps: by('gap'), total: rows.length };
}
