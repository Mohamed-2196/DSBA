// The sectors an employer card names, each with a generic icon (never a brand mark). The editor offers these names;
// another sector shows with a plain building.
import { glyph, type Glyph } from '../../../ui';

export const SECTOR_ICONS: Readonly<Record<string, Glyph>> = {
  Bank: glyph.bank,
  Investment: glyph.chartLine,
  Regulator: glyph.scales,
  'Sovereign fund': glyph.vault,
  'Public body': glyph.building,
  Exchange: glyph.trendUp,
  'Audit & consulting': glyph.briefcase,
  Consulting: glyph.handshake,
  Telecom: glyph.tower,
  Technology: glyph.cloud,
  Fintech: glyph.card,
  Energy: glyph.bolt,
  Industry: glyph.factory,
};

export const SECTORS: readonly string[] = Object.keys(SECTOR_ICONS);
