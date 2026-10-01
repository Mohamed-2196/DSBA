// Public API of the search feature (agent E). Signatures are a contract — do not change them.
export { CommandPalette } from './CommandPalette.jsx'; // mounted once by the shell
export { openCommandPalette } from './bus.js'; // also bound to ⌘K / Ctrl+K and the top-bar search field
