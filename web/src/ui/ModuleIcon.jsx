import {
  Brain, Briefcase, ChartBar, ChartLineUp, ChartScatter, Coins, Database, Function as FunctionIcon, ListChecks,
  Megaphone, PresentationChart, Scales, Sigma, Storefront, TerminalWindow, WaveSine, BookOpenText,
} from '@phosphor-icons/react';
import { getModule } from '../data/modules';

// Only the icons modules.js uses (keeps Phosphor tree-shaken).
const ICONS = {
  Brain, Briefcase, ChartBar, ChartLineUp, ChartScatter, Coins, Database, Function: FunctionIcon, ListChecks,
  Megaphone, PresentationChart, Scales, Sigma, Storefront, TerminalWindow, WaveSine,
};

/**
 * A module's Phosphor icon by module id (or icon name).
 * @param {string} moduleId  e.g. 'econometrics'
 * @param {string} name      Phosphor name from MODULES[].icon (alternative to moduleId)
 * Other props (size, weight, color, className) go to the Phosphor icon.
 */
export function ModuleIcon({ moduleId, name, weight = 'regular', ...rest }) {
  const iconName = name || getModule(moduleId)?.icon;
  const Icon = ICONS[iconName] || BookOpenText;
  return <Icon weight={weight} aria-hidden="true" {...rest} />;
}
