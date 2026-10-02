// Where a forum image really is. Post bodies refer to pictures as '/demo/forum/x.jpg' (see markdown.js);
// the files live in public/, which the site serves under its base path ('/DSBA/').
export function imageUrl(src) {
  return `${import.meta.env.BASE_URL}${String(src).replace(/^\//, '')}`;
}
