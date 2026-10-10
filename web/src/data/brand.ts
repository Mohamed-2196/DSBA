// Brand artwork supplied by the student rep (Mohamed). Paths are relative to public/.
//
//   brand/dsba-logo.png        his DSBA wordmark, blue on transparent (light surfaces)
//   brand/dsba-logo-white.png  the same wordmark in white (dark surfaces)
//   brand/dsba-icon.png        a square app tile cut from the wordmark's "D" (avatars, favicon)
//   brand/newsletter-cover.jpg his cover illustration for the launch issue: 3:4, no text, plain bands
//                              at the top and bottom for the nameplate and the cover lines
//
// To swap any of them, replace the file and keep the names. Set a constant to null to fall back: no logo
// at all (ui/HubLogo.tsx prints the name as text), or the typographic newsletter cover.

export interface HubLogoArt {
  light: string;
  dark: string;
  icon: string;
  ratio: number;
}

/** The DSBA wordmark: it already reads "DSBA", so lockups set only "Hub" next to it. */
export const HUB_LOGO: HubLogoArt | null = {
  light: 'brand/dsba-logo.png',
  dark: 'brand/dsba-logo-white.png',
  icon: 'brand/dsba-icon.png',
  ratio: 2095 / 521,
};

/** Path of the square logo tile under public/, or null while there is no logo. */
export const HUB_LOGO_SRC: string | null = HUB_LOGO ? HUB_LOGO.icon : null;

/** Path of the launch issue's cover illustration under public/, or null for the typographic cover. */
export const NEWSLETTER_COVER_ART: string | null = 'brand/newsletter-cover.jpg';

/** A path under public/ as a URL the app can load (the app is served from a sub-path), or null. */
export const brandAssetUrl = (path: string | null | undefined): string | null => (path ? import.meta.env.BASE_URL + path : null);
