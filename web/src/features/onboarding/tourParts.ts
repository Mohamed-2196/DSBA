// A tour step's words as plain text and keys: text between `backticks` is a key, and {mod} is the platform's key.
// Pure, so it can be tested.

export interface TourPart {
  text: string;
  /** shown as a key to press */
  key: boolean;
}

export function tourParts(text: string, mod: string): TourPart[] {
  return text
    .split('`')
    .map((part, i) => ({ text: part.replaceAll('{mod}', mod), key: i % 2 === 1 }))
    .filter((part) => part.text !== '');
}
