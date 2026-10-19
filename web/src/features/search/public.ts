// Public API of the search feature.
//   <PaletteHost />             the ⌘K palette's place, mounted once by the shell (the palette loads when first opened)
//   openCommandPalette(query?)  opens it from anywhere (also bound to ⌘K / Ctrl+K and "/")
export { PaletteHost } from './PaletteHost';
export { openCommandPalette } from './bus';
