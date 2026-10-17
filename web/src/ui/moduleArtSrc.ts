// A module's art as the API stores it (ModuleSummary.art): a picture of the app ('modules/module-ec1002.png') or an
// uploaded image ('/api/v1/media/<id>'). A module without art shows its unit code, or its icon, instead.
import { pictureSrc } from '../api/pictures';

/** Where to load a module's art from, or null when it has none (or something that isn't a picture). */
export function moduleArtSrc(art: string | null | undefined): string | null {
  return pictureSrc(art);
}
