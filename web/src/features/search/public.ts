// Public API of the search feature.
//   <CommandPalette />          the ⌘K palette, mounted once by the shell
//   openCommandPalette(query?)  opens it from anywhere (also bound to ⌘K / Ctrl+K and "/")
export { CommandPalette } from './CommandPalette';
export { openCommandPalette } from './bus';
