// Career Navigator: where logo files live. An editor uploads an organisation's own logo, with its permission, in
// Manage; it is served by the API (/api/v1/career/logos/<uploadId>). Without one, the bundled file is used:
//   employers: public/logos/employers/<id>.png      certificates: public/logos/certs/<id>.png
// public/logos/wanted.json and public/logos/README.md list every bundled file this page asks for.
import type { CareerDoc, CareerLogo } from '../../../api/types';

export type LogoKind = 'employer' | 'cert';

const DIRS: Record<LogoKind, string> = { employer: 'employers', cert: 'certs' };
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** 'employers/nbb.png' for ('employer', 'nbb'): the path under public/logos. */
export function logoFile(kind: LogoKind, id: string): string {
  return `${DIRS[kind]}/${SAFE_ID.test(id) ? id : 'missing'}.png`;
}

/** The URL the browser asks for, with the app's base path. */
export function logoUrl(kind: LogoKind, id: string): string {
  return `${import.meta.env.BASE_URL}logos/${logoFile(kind, id)}`;
}

/** Where an uploaded logo is shown from. */
export function uploadedLogoUrl(logo: Pick<CareerLogo, 'uploadId'>): string {
  return `/api/v1/career/logos/${encodeURIComponent(logo.uploadId)}`;
}

/** The logo to show: the uploaded one if there is one, else the bundled file. */
export function logoSrc(kind: LogoKind, id: string, logo?: CareerLogo | null): string {
  return logo ? uploadedLogoUrl(logo) : logoUrl(kind, id);
}

/** The uploaded logo of the employer or certificate with this id, if it has one. */
export function logoOf(doc: Pick<CareerDoc, 'employers' | 'certs'>, kind: LogoKind, id: string): CareerLogo | null {
  const list = kind === 'employer' ? doc.employers : doc.certs;
  return list.find((x) => x.id === id)?.logo ?? null;
}
