// Career Navigator: where logo files live. The student rep supplies the official files; the code only names the slots.
//   employers: public/logos/employers/<id>.png      certificates: public/logos/certs/<id>.png
// public/logos/wanted.json and public/logos/README.md list every file this page asks for.

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
