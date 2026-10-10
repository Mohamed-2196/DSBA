// Career Navigator: where logo files live. The student rep supplies the official files; the code only names the slots.
//   employers: public/logos/employers/<id>.png      certificates: public/logos/certs/<id>.png
// public/logos/wanted.json and public/logos/README.md list every file this page asks for.

const DIRS = { employer: 'employers', cert: 'certs' };

/** 'employers/nbb.png' for ('employer', 'nbb'): the path under public/logos. */
export function logoFile(kind, id) {
  return `${DIRS[kind] || DIRS.employer}/${id}.png`;
}

/** The URL the browser asks for, with the app's base path (/DSBA/ in production). */
export function logoUrl(kind, id) {
  return `${import.meta.env.BASE_URL}logos/${logoFile(kind, id)}`;
}
