// Choosing your Year 3 electives: what each elective adds, read from Career Navigator's document (its `chosen` map,
// skills and roles) and the module catalogue, so the page can never disagree with either.
import type { CareerDoc, CareerRole, ModuleSummary, SkillTaught } from '../../../api/types';

export interface ElectiveSkill {
  id: string;
  name: string;
  depth: SkillTaught['depth'];
  what: string;
  /** no compulsory module takes this skill as far */
  adds: boolean;
}

export interface Elective {
  module: ModuleSummary;
  /** strongest first; the skills it adds before the others */
  skills: ElectiveSkill[];
  /** roles that need a skill this elective adds (or, when it adds none, any skill it teaches) */
  roles: CareerRole[];
}

/** The electives in catalogue order (`catalogue`: the module list), each with its skills and the roles they lead to. */
export function electives(doc: CareerDoc, catalogue: readonly ModuleSummary[]): Elective[] {
  const mods = catalogue.filter((m) => doc.chosen[m.id] === 'elective');

  // How far the compulsory modules (everything a student doesn't choose) take each skill.
  const core = new Map<string, number>();
  for (const [skillId, skill] of Object.entries(doc.skills)) {
    const depth = skill.taught.filter((t) => !doc.chosen[t.module]).reduce((m, t) => Math.max(m, t.depth), 0);
    core.set(skillId, depth);
  }

  return mods.map((module) => {
    const skills: ElectiveSkill[] = [];
    for (const [id, skill] of Object.entries(doc.skills)) {
      const t = skill.taught.find((x) => x.module === module.id);
      if (!t || t.depth === 0) continue;
      skills.push({ id, name: skill.name, depth: t.depth, what: t.what, adds: t.depth > (core.get(id) ?? 0) });
    }
    skills.sort((a, b) => Number(b.adds) - Number(a.adds) || b.depth - a.depth || a.name.localeCompare(b.name));
    const added = new Set(skills.filter((s) => s.adds).map((s) => s.id));
    const pool = added.size ? added : new Set(skills.map((s) => s.id));
    const roles = doc.roles.filter((r) => r.skills.some((s) => pool.has(s)));
    return { module, skills, roles };
  });
}
