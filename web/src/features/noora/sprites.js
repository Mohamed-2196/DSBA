// Mini Noora's artwork: the PNGs in public/noora (described by public/noora/sprites.json).
// The files are final. This module only names them, says where they are and how to size them.

/** Full-body poses. They all share one canvas, so swapping one for another never moves her. */
export const POSES = ['idle', 'side-right', 'side-left', 'back', 'walk-right', 'walk-left', 'talking', 'happy', 'excited', 'surprised', 'sad'];

/** Head-and-shoulders portraits, used for her face in the chat. */
export const BUSTS = ['wave', 'neutral', 'thinking', 'winking', 'laughing', 'angry'];

/** A file under public/noora as a URL the app can load (the app is served from a sub-path). */
const url = (file) => `${import.meta.env.BASE_URL}noora/${file}.png`;
export const poseUrl = (pose) => url(pose);
export const bustUrl = (bust) => url(`bust-${bust}`);

// The full-body canvas (sprites.json → canvas.full): 680 × 784, her feet on y = 768, her body centred
// on x = 340. Standing still she fills the middle half of the width, from y = 60 down to her feet.
// The pixels are 2×, so she should not be drawn taller than about 350 px.
const CANVAS = { w: 680, h: 784, feetY: 768, headY: 60, bodyW: 340 };
/** How tall she stands, head to feet, in CSS pixels. */
export const HEIGHT = { desktop: 120, phone: 92 };

/**
 * Sizes for drawing her `height` CSS pixels tall (head to feet).
 * `w` × `h` is the box she really fills (it is also what you grab); the canvas is larger and is
 * placed around that box with `canvas` so her feet land on its bottom edge.
 */
export function figure(height) {
  const scale = height / (CANVAS.feetY - CANVAS.headY);
  return {
    w: Math.round(CANVAS.bodyW * scale),
    h: height,
    canvas: {
      width: CANVAS.w * scale,
      height: CANVAS.h * scale,
      left: ((CANVAS.bodyW - CANVAS.w) / 2) * scale,
      top: -CANVAS.headY * scale,
    },
  };
}

// The bust canvas is 600 × 600. Her head is about 320 px wide and sits around (300, 212); in the
// wave she leans away from her raised hand, so the head is a little to the left there.
const FACE = { size: 340, y: 212, x: { wave: 272 }, defaultX: 300, canvas: 600 };

/** How to place a bust inside a round frame so that her face fills it (percentages of the frame). */
export function faceCrop(bust) {
  const x = FACE.x[bust] ?? FACE.defaultX;
  return {
    width: `${(FACE.canvas / FACE.size) * 100}%`,
    left: `${50 - (x / FACE.size) * 100}%`,
    top: `${50 - (FACE.y / FACE.size) * 100}%`,
  };
}

// Fetch every sprite once, up front, so a change of pose never has to wait for a download.
// They are asked for at low priority, so the page's own files go first, and the Image objects are
// kept so the browser holds on to what it fetched.
const kept = [];

export function preloadSprites() {
  if (kept.length || typeof Image === 'undefined') return;
  for (const src of [...POSES.map(poseUrl), ...BUSTS.map(bustUrl)]) {
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = 'low';
    img.src = src;
    kept.push(img);
  }
}
