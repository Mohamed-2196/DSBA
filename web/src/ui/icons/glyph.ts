/**
 * One brand icon on the 24 px grid: its paths in paint order, each tagged with how it is painted.
 * l a line, h the heavy line (the magnifier's handle), t the tinted body, p a paper part, f a solid mark.
 */
export type GlyphPart = readonly ['l' | 'h' | 't' | 'p' | 'f', string];
export type Glyph = readonly GlyphPart[];
