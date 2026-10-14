// Module illustrations (public/modules, 512×512 transparent PNGs), by module id. A module without one keeps its
// text unit code (or its Phosphor ModuleIcon when it has no code) as the visual.
const ART: Readonly<Record<string, string>> = {
  economics: 'module-ec1002.png',
  business: 'module-mn1178.png',
  mathematics: 'module-mt1186.png',
  statistics: 'module-st1215.png',
  'advanced-stats-distribution': 'module-st2133.png',
  'advanced-stats-inferential': 'module-st2134.png',
  'programming-data-science': 'module-st2195.png',
  'business-analytics': 'module-st2187.png',
  econometrics: 'module-ec2020.png',
};

/** The illustration's URL for a module, or null when it has none. */
export function moduleArtSrc(moduleId: string | null | undefined): string | null {
  const file = moduleId && Object.hasOwn(ART, moduleId) ? ART[moduleId] : undefined;
  return file ? `${import.meta.env.BASE_URL}modules/${file}` : null;
}
