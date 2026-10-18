// A tour step's words: text between `backticks` is a key to press, and {mod} is the platform's key (⌘ on a Mac, Ctrl
// elsewhere), so "Press `{mod}``K`" reads as the keys themselves.
import { Kbd, modKeyLabel } from '../../ui';
import { tourParts } from './tourParts';

export function TourText({ text }: { text: string }) {
  return (
    <>{tourParts(text, modKeyLabel()).map((part, i) => (part.key ? <Kbd key={i}>{part.text}</Kbd> : part.text))}</>
  );
}
