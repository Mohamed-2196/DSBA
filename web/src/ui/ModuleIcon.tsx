import {
  Brain, Briefcase, ChartBar, ChartLineUp, ChartScatter, Coins, Database, Function as FunctionIcon, ListChecks,
  Megaphone, PresentationChart, Scales, Sigma, Storefront, TerminalWindow, WaveSine, BookOpenText,
  type Icon, type IconProps,
} from '@phosphor-icons/react';
import { useModulesOptional } from '../state/modules';

// Only the icons the module catalogue uses (keeps Phosphor tree-shaken).
const ICONS: Record<string, Icon> = {
  Brain, Briefcase, ChartBar, ChartLineUp, ChartScatter, Coins, Database, Function: FunctionIcon, ListChecks,
  Megaphone, PresentationChart, Scales, Sigma, Storefront, TerminalWindow, WaveSine,
};

export interface ModuleIconProps extends Omit<IconProps, 'name' | 'ref'> {
  /** e.g. 'econometrics': the icon comes from the module catalogue */
  moduleId?: string | null;
  /** a Phosphor name from ModuleSummary.icon (alternative to moduleId) */
  name?: string | null;
}

/** A module's Phosphor icon by module id (or icon name). Other props (size, weight, color, className) go to the icon. */
export function ModuleIcon({ moduleId, name, weight = 'regular', ...rest }: ModuleIconProps) {
  const modules = useModulesOptional();
  const iconName = name || modules?.getModule(moduleId)?.icon;
  const Glyph = (iconName && ICONS[iconName]) || BookOpenText;
  return <Glyph weight={weight} aria-hidden="true" {...rest} />;
}
