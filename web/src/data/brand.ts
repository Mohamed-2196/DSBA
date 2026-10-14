// Brand artwork. Paths are relative to public/.
//
//   brand/dsba-logo.png                      the official DSBA wordmark, blue on transparent (light surfaces)
//   brand/dsba-logo-white.png                the same wordmark in white (dark surfaces)
//   brand/hub-lockup-horizontal.png          "DSBA Hub": the official wordmark untouched, with "Hub" set in
//                                            matching heavy type and cut by the same sweeping stripes
//   brand/hub-lockup-horizontal-white.png    the same lockup in white (dark surfaces)
//   brand/hub-icon.png                       the square "DH" app tile (avatars, notifications)
//   brand/hub-icon-1024.png                  the tile's master; deploy/app-icons.py makes the PWA icons and
//   brand/hub-icon-maskable-1024.png         favicon from these two
//   brand/newsletter-cover.jpg               the cover illustration for the launch issue (the issue's content links it)
//
// To swap any of them, replace the file and keep the names. Set HUB_LOGO to null to fall back to no logo at
// all (ui/HubLogo.tsx prints the name as text).

export interface HubLogoArt {
  /** the horizontal lockup, which reads "DSBA Hub" by itself */
  light: string;
  dark: string;
  /** width / height of the lockup artwork */
  ratio: number;
  /** the square tile */
  icon: string;
}

export const HUB_LOGO: HubLogoArt | null = {
  light: 'brand/hub-lockup-horizontal.png',
  dark: 'brand/hub-lockup-horizontal-white.png',
  ratio: 1414 / 200,
  icon: 'brand/hub-icon.png',
};

/** Path of the square logo tile under public/, or null while there is no logo. */
export const HUB_LOGO_SRC: string | null = HUB_LOGO ? HUB_LOGO.icon : null;

/** A path under public/ as a URL the app can load (the app is served from a sub-path), or null. */
export const brandAssetUrl = (path: string | null | undefined): string | null => (path ? import.meta.env.BASE_URL + path : null);
