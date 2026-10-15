// The sectors an employer card names, each with a generic icon (never a brand mark). The editor offers these names;
// another sector shows with a plain building.
import { Bank, Briefcase, Buildings, CellTower, ChartLineUp, Cloud, CreditCard, Factory, Handshake, Lightning, Scales, TrendUp, Vault, type Icon } from '@phosphor-icons/react';

export const SECTOR_ICONS: Readonly<Record<string, Icon>> = {
  Bank,
  Investment: ChartLineUp,
  Regulator: Scales,
  'Sovereign fund': Vault,
  'Public body': Buildings,
  Exchange: TrendUp,
  'Audit & consulting': Briefcase,
  Consulting: Handshake,
  Telecom: CellTower,
  Technology: Cloud,
  Fintech: CreditCard,
  Energy: Lightning,
  Industry: Factory,
};

export const SECTORS: readonly string[] = Object.keys(SECTOR_ICONS);
