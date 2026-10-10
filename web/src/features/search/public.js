// Public API of the search feature (agent E). Signatures are a contract — do not change them.
export { CommandPalette } from './CommandPalette'; // mounted once by the shell
export { openCommandPalette } from './bus'; // also bound to ⌘K / Ctrl+K and the top-bar search field
