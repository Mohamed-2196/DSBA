// Real documents live in public/demo/library/. Files keep a base-relative path ('demo/library/x.png');
// this turns it into a URL that works under the app's base path ('/DSBA/' when deployed).
export function assetUrl(src) {
  return `${import.meta.env.BASE_URL}${String(src).replace(/^\//, '')}`;
}
