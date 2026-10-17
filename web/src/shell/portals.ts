// The sidebar's and the More drawer's links to BIBF's and the University's sites. Their logos are files of the app;
// their labels and addresses come from Site settings, so the links show once those have loaded.
import { httpsHref, useSite } from '../features/site/public';
import type { BrandLogoName } from '../ui';

export interface PortalLink {
  id: string;
  label: string;
  href: string;
  logo: BrandLogoName;
  logoHeight?: number;
}

const PORTALS = [
  { id: 'myclass', link: 'myclass', logo: 'myclass', logoHeight: 20 },
  { id: 'uol', link: 'uolPortal', logo: 'uol', logoHeight: 22 },
] as const;

export function usePortalLinks(): PortalLink[] {
  const site = useSite().data;
  if (!site) return [];
  return PORTALS.flatMap((p) => {
    const { label, url } = site.links[p.link];
    const href = httpsHref(url);
    return href ? [{ id: p.id, label, href, logo: p.logo, logoHeight: p.logoHeight }] : [];
  });
}
