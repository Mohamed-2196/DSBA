// Career Navigator: how well a student's modules cover a role. Pure functions over the catalogue in
// ../data/skills.js and the module list in src/data/modules.js, so the numbers can never drift from either.
import { getModule } from '../../../data/modules.js';
import { CHOSEN, DEPTH_LABEL, SKILLS } from '../data/skills.js';

const bestDepth = (list) => list.reduce((m, t) => Math.max(m, t.depth), 0);

/**
 * One skill, seen by a student who has reached `year` (1|2|3): modules up to and including that year count.
 *   covered: the modules so far take it to a solid grounding (depth 2) or better.
 *   later:   they don't yet, but a later year does.
 *   gap:     DSBA never takes it past an intro: it is yours to close.
 * `solid` and `ghost` are meter segments out of 3: reached so far, and added by later years.
 */
export function evaluateSkill(skillId, year) {
  const skill = SKILLS[skillId];
  if (!skill) return null;
  const taught = skill.taught
    .map((t) => ({ ...t, mod: getModule(t.module), chosen: CHOSEN[t.module] || null }))
    .filter((t) => t.mod);
  const soFar = taught.filter((t) => t.mod.year <= year);
  const ahead = taught.filter((t) => t.mod.year > year);
  const solid = bestDepth(soFar);
  const total = bestDepth(taught);
  const status = total < 2 ? 'gap' : solid >= 2 ? 'covered' : 'later';

  // The modules worth naming in the row, strongest first (earliest year breaks a tie).
  const strongest = (list) => [...list].sort((a, b) => b.depth - a.depth || a.mod.year - b.mod.year);
  let named = [];
  let detail = skill.gapNote || '';
  if (status === 'covered') {
    named = strongest(soFar.filter((t) => t.depth >= 2));
    detail = named[0]?.what || detail;
  } else if (status === 'later') {
    named = strongest(ahead.filter((t) => t.depth >= 2));
    detail = named[0]?.what || detail;
  } else {
    named = strongest(taught.filter((t) => t.depth >= 1));
  }

  // `from`: the year a "later" skill first arrives.
  const from = status === 'later' && named.length ? Math.min(...named.map((t) => t.mod.year)) : null;
  const label = from ? `From Year ${from}` : DEPTH_LABEL[status === 'gap' ? total : solid];

  return { id: skillId, skill, status, solid, ghost: total - solid, total, from, named: named.slice(0, 2), detail, label };
}

/** Every skill of a role for a year, with the three headline counts. */
export function evaluateRole(role, year) {
  const rows = role.skills.map((id) => evaluateSkill(id, year)).filter(Boolean);
  const by = (status) => rows.filter((r) => r.status === status);
  return { rows, covered: by('covered'), later: by('later'), gaps: by('gap'), total: rows.length };
}
