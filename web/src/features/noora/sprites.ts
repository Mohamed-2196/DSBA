// Mini Noora's artwork: the PNGs in public/noora (described by public/noora/sprites.json).
// The files are final. This module only names them, says where they are and how to size them.

/** Full-body poses. They all share one canvas; the chat shows one when it is empty. */
export const POSES = ['idle', 'side-right', 'side-left', 'back', 'walk-right', 'walk-left', 'talking', 'happy', 'excited', 'surprised', 'sad'] as const;
export type Pose = (typeof POSES)[number];

/** Head-and-shoulders portraits, used for her face in the chat. */
export const BUSTS = ['wave', 'neutral', 'thinking', 'winking', 'laughing', 'angry'] as const;
export type Bust = (typeof BUSTS)[number];

/** A file under public/noora as a URL the app can load (the app is served from a sub-path). */
const url = (file: string): string => `${import.meta.env.BASE_URL}noora/${file}.png`;
export const poseUrl = (pose: Pose): string => url(pose);
export const bustUrl = (bust: Bust): string => url(`bust-${bust}`);

/** The pose she greets with while the chat is empty. */
export const EMPTY_POSE: Pose = 'happy';

// The bust canvas is 600 × 600. Her head is about 320 px wide and sits around (300, 212); in the
// wave she leans away from her raised hand, so the head is a little to the left there.
const FACE: { size: number; y: number; x: Partial<Record<Bust, number>>; defaultX: number; canvas: number } = { size: 340, y: 212, x: { wave: 272 }, defaultX: 300, canvas: 600 };

/** How to place a bust inside a round frame so that her face fills it (percentages of the frame). */
export function faceCrop(bust: Bust): { width: string; left: string; top: string } {
  const x = FACE.x[bust] ?? FACE.defaultX;
  return {
    width: `${(FACE.canvas / FACE.size) * 100}%`,
    left: `${50 - (x / FACE.size) * 100}%`,
    top: `${50 - (FACE.y / FACE.size) * 100}%`,
  };
}

// Fetch the sprites the chat uses once, before it opens, so a change of expression never has to wait for a download.
// They are asked for at low priority, so the page's own files go first, and the Image objects are
// kept so the browser holds on to what it fetched.
const kept: HTMLImageElement[] = [];

export function preloadSprites(): void {
  if (kept.length || typeof Image === 'undefined') return;
  for (const src of [poseUrl(EMPTY_POSE), ...BUSTS.map(bustUrl)]) {
    const img = new Image();
    img.decoding = 'async';
    // fetchPriority is not in every DOM typing yet.
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
    img.src = src;
    kept.push(img);
  }
}
