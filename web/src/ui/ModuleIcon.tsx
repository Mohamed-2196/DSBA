import { Icon } from './Icon';
import type { Glyph } from './icons/glyph';
import {
  book,
  brain,
  briefcase,
  chartBar,
  chartLine,
  chartScatter,
  checklist,
  coins,
  database,
  formula,
  megaphone,
  presentation,
  scales,
  shop,
  sigma,
  terminal,
  wave,
} from './icons/glyphs';
import { useModulesOptional } from '../state/modules';

// The module catalogue's icon names (ModuleSummary.icon) and the brand glyph each one draws.
const ICONS: Record<string, Glyph> = {
  Brain: brain,
  Briefcase: briefcase,
  ChartBar: chartBar,
  ChartLineUp: chartLine,
  ChartScatter: chartScatter,
  Coins: coins,
  Database: database,
  Function: formula,
  ListChecks: checklist,
  Megaphone: megaphone,
  PresentationChart: presentation,
  Scales: scales,
  Sigma: sigma,
  Storefront: shop,
  TerminalWindow: terminal,
  WaveSine: wave,
};

export interface ModuleIconProps {
  /** e.g. 'econometrics': the icon comes from the module catalogue */
  moduleId?: string | null;
  /** an icon name from ModuleSummary.icon (alternative to moduleId) */
  name?: string | null;
  size?: number;
  className?: string;
}

/** A module's brand icon by module id (or icon name); a book when the module names none. */
export function ModuleIcon({ moduleId, name, size, className }: ModuleIconProps) {
  const modules = useModulesOptional();
  const iconName = name || modules?.getModule(moduleId)?.icon;
  return <Icon glyph={(iconName && ICONS[iconName]) || book} size={size} className={className} />;
}
