#!/usr/bin/env python3
"""Cuts Mohamed's "Mini Noora" sprite sheet (a generated sheet, 1254 px, with a checkerboard baked in
as its background) into transparent PNGs, one per pose, normalised so poses can be swapped in place.

  python3 tools/noora/cut_sprites.py     -> assets/noora/*.png (+ sprites.json) and the app's public/noora/

The sheet is small (a figure is about 350 px tall), so each pose is first enlarged 4x with the
Real-ESRGAN anime model (run on the CPU with ncnn: `pip install ncnn`; the two model files,
realesrgan-x4plus-anime.param and .bin, come from the Real-ESRGAN ncnn release zip on GitHub and go in
tools/noora/models/, which is not committed), the
background is cut at that size, and the result is saved at 2x the sheet's scale.

Full-body poses share one canvas (same body scale, feet on one baseline); the half-body poses of the
sheet's third row ("busts") share another (heads aligned).
"""
import json
from pathlib import Path
import numpy as np
import ncnn
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

SRC = Path('/root/.claude/uploads/331caa53-7cba-5bfe-8500-672e2c76573d/c4f39e2f-image.png')   # the second sheet he sent: a clearer BIBF badge
HERE = Path(__file__).resolve().parent
FILM = HERE.parent.parent / 'assets' / 'noora'
APP = Path('/home/claude/dsba/public/noora')
K = 4                                               # the model's enlargement

# cell boxes on the 1254 px sheet (x0, y0, x1, y1): below each label pill, split midway between neighbours
FULL = {
    'idle':       (20, 58, 250, 440),
    'side-right': (256, 58, 505, 440),
    'side-left':  (512, 58, 755, 440),
    'back':       (758, 58, 985, 440),
    'walk-right': (988, 58, 1240, 440),
    'walk-left':  (20, 494, 236, 818),
    'talking':    (238, 494, 463, 818),
    'happy':      (464, 494, 644, 818),
    'excited':    (644, 494, 872, 818),
    'surprised':  (873, 494, 1052, 818),
    'sad':        (1054, 494, 1244, 818),
}
ROW1 = ('idle', 'side-right', 'side-left', 'back', 'walk-right')
BUST = {
    'angry':    (14, 862, 240, 1113),
    'laughing': (242, 862, 445, 1118),
    'winking':  (447, 862, 670, 1118),
    'thinking': (672, 862, 852, 1118),
    'wave':     (854, 862, 1059, 1118),     # the sheet calls it "Bye"
    'neutral':  (1060, 862, 1240, 1118),
}

im = Image.open(SRC).convert('RGB')
a = np.asarray(im)
ai = a.astype(np.int16)
mx, mn = ai.max(-1), ai.min(-1)
cand = (mx - mn <= 9) & (mn >= 222)                 # checkerboard tones: neutral, very light
lab, n = ndi.label(cand)
border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
bg = np.isin(lab, border[border > 0])
# enclosed pockets of checkerboard (between an arm and the body…): they contain both tones
grey = cand & (mn <= 243)
sizes = ndi.sum(cand, lab, index=np.arange(1, n + 1))
greys = ndi.sum(grey, lab, index=np.arange(1, n + 1))
pockets = [i + 1 for i in range(n) if sizes[i] >= 40 and greys[i] / sizes[i] >= 0.18 and (i + 1) not in border]
bg |= np.isin(lab, pockets)
fg = ~bg

net = ncnn.Net()
net.opt.use_vulkan_compute = False
net.opt.num_threads = 2
net.load_param(str(HERE / 'models' / 'realesrgan-x4plus-anime.param'))
net.load_model(str(HERE / 'models' / 'realesrgan-x4plus-anime.bin'))


def enlarge_one(rgb):
    h, w, _ = rgb.shape
    m = ncnn.Mat.from_pixels(np.ascontiguousarray(rgb), ncnn.Mat.PixelType.PIXEL_RGB, w, h)
    m.substract_mean_normalize([], [1 / 255.0] * 3)
    ex = net.create_extractor()
    ex.input('data', m)
    _, out = ex.extract('output')
    return (np.clip(np.array(out), 0, 1).transpose(1, 2, 0) * 255).round().astype(np.uint8)


def enlarge(rgb, tile=150, pad=14):
    """K x enlargement, in horizontal bands: a whole cell at once needs more memory than this machine
    gives one process. Each band is enlarged with `pad` rows of its neighbours as context and the
    context is cut off again, so the bands meet without a seam."""
    h = rgb.shape[0]
    if h <= tile + 2 * pad:
        return enlarge_one(rgb)
    out = []
    for y in range(0, h, tile):
        y0, y1 = max(0, y - pad), min(h, y + tile + pad)
        big = enlarge_one(rgb[y0:y1])
        out.append(big[(y - y0) * K:(min(h, y + tile) - y0) * K])
    return np.concatenate(out, axis=0)


def keep_badge(src, big):
    """The badge on her jacket is four letters about five pixels tall, and the enlarger redraws them as
    squiggles. So the badge is found in the enlarged picture (a white disc with blue marks inside it, on the
    navy of the jacket) and a plain, sharpened enlargement of the sheet's own pixels is put back there:
    softer than the rest, but it says what the sheet says. Returns the picture and how many discs it restored."""
    bi = big.astype(np.int16)
    white = bi.min(-1) >= 212
    navy = (bi[..., 2] >= 55) & (bi[..., 2] <= 175) & (bi[..., 0] <= 75) & (bi[..., 1] <= 100)
    lab_, n_ = ndi.label(white)
    region = np.zeros(white.shape, bool)
    found = 0
    for i, sl in enumerate(ndi.find_objects(lab_), 1):
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if not (30 <= hh <= 130 and 14 <= ww <= 130):
            continue
        pad = 12
        ys = slice(max(0, sl[0].start - pad), min(white.shape[0], sl[0].stop + pad))
        xs = slice(max(0, sl[1].start - pad), min(white.shape[1], sl[1].stop + pad))
        comp = lab_[ys, xs] == i
        area = int(comp.sum())
        if not 900 <= area <= 12000:
            continue
        filled = ndi.binary_fill_holes(comp)
        holes = filled & ~comp
        if holes.sum() < 0.04 * filled.sum():
            continue                                             # nothing written on it
        sub = bi[ys, xs]
        if (sub[..., 2] - sub[..., 0])[holes].mean() < 30:
            continue                                             # the marks are not blue
        ring = ndi.binary_dilation(filled, iterations=8) & ~filled
        if navy[ys, xs][ring].mean() < 0.35:
            continue                                             # not on the jacket
        # only the face of the disc is taken from the sheet; its rim stays as the enlarger drew it
        region[ys, xs] |= ndi.binary_dilation(holes, iterations=7) & ndi.binary_erosion(filled, iterations=4)
        found += 1
    if not found:
        return big, 0
    plain = Image.fromarray(src).resize((big.shape[1], big.shape[0]), Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.2)).filter(ImageFilter.UnsharpMask(radius=7, percent=110, threshold=0))
    w = np.clip(ndi.gaussian_filter(region.astype(np.float32), 1.6) * 1.15, 0, 1)[..., None]
    return (big * (1 - w) + np.asarray(plain, np.float32) * w + 0.5).astype(np.uint8), found


def cut(box):
    """-> RGBA image at K x, and its boolean mask."""
    x0, y0, x1, y1 = box
    m = fg[y0:y1, x0:x1].copy()
    l2, k = ndi.label(m, structure=np.ones((3, 3)))
    keep = np.zeros_like(m)
    for i in range(1, k + 1):
        comp = l2 == i
        ys, xs = np.where(comp)
        touches = xs.min() == 0 or ys.min() == 0 or xs.max() == m.shape[1] - 1 or ys.max() == m.shape[0] - 1
        if comp.sum() < 6 or (touches and comp.sum() < 400):     # specks, slivers of a neighbour or of a label pill
            continue
        keep |= comp
    big, badges = keep_badge(a[y0:y1, x0:x1], enlarge(a[y0:y1, x0:x1]))
    print('  cell', box, 'badge restored' if badges else 'no badge found', flush=True)
    bi = big.astype(np.int16)
    light = (bi.max(-1) - bi.min(-1) <= 12) & (bi.min(-1) >= 226)            # background-looking at K x
    up = np.asarray(Image.fromarray((keep * 255).astype(np.uint8)).resize((big.shape[1], big.shape[0]), Image.BICUBIC)) > 127
    sure_fg = ndi.binary_erosion(up, iterations=7)
    sure_bg = ndi.binary_erosion(~up, iterations=7, border_value=1)
    band = ~sure_fg & ~sure_bg
    # in the band along the edge, the enlarged picture decides: light neutral pixels joined to the outside are background
    maybe_bg = sure_bg | (band & light)
    l3, _ = ndi.label(maybe_bg)
    outside = np.unique(l3[sure_bg])
    bgK = np.isin(l3, outside[outside > 0])
    mK = ~bgK
    mK = ndi.binary_opening(mK, iterations=1)
    core = ndi.binary_erosion(mK, iterations=2)
    alpha = np.clip(ndi.gaussian_filter(core.astype(np.float32), 1.6) * 1.35, 0, 1)
    alpha[~ndi.binary_dilation(mK, iterations=1)] = 0
    ys, xs = np.where(alpha > 0.02)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    out = np.dstack([big, (alpha * 255).round().astype(np.uint8)])[by0:by1, bx0:bx1]
    return Image.fromarray(out, 'RGBA'), mK[by0:by1, bx0:bx1]


def main_component(m):
    l2, k = ndi.label(m, structure=np.ones((3, 3)))
    return l2 == max(range(1, k + 1), key=lambda i: (l2 == i).sum())


def body_rows(m):
    ys, _ = np.where(main_component(m))
    return ys.min(), ys.max() + 1


def feet_x(m, y1):
    y0, _ = body_rows(m)
    rows = m[int(y0 + (y1 - y0) * 0.93):y1]
    xs = np.where(rows.any(0))[0]
    return (xs.min() + xs.max()) / 2


meta = {'full': {}, 'bust': {}}
for root in (FILM, APP):
    root.mkdir(parents=True, exist_ok=True)

# ── full-body poses: same body height, feet on one baseline (canvas at 2x the sheet's scale)
CW, CH, BASE, TARGET = 680, 784, 768, 704.0
cuts = {k: cut(b) for k, b in FULL.items()}
heights = {k: body_rows(m)[1] - body_rows(m)[0] for k, (_, m) in cuts.items()}
row1 = np.mean([heights[k] for k in ('idle', 'side-right', 'side-left', 'back')])
row2 = np.mean([heights[k] for k in ('talking', 'happy', 'excited', 'surprised', 'sad')])
for k, (img, m) in cuts.items():
    scale = TARGET / (row1 if k in ROW1 else row2)
    _, y1 = body_rows(m)
    fx = feet_x(m, y1)
    big = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    canvas.alpha_composite(big, (round(CW / 2 - fx * scale), round(BASE - y1 * scale)))
    meta['full'][k] = {'file': f'{k}.png'}
    for root in (FILM, APP):
        canvas.save(root / f'{k}.png', optimize=True)
    print('full', k, heights[k], round(scale, 3))

# ── busts: heads centred, cut edge on the bottom of the canvas
BW, BH, BSCALE = 600, 600, 2.24 / K
for k, box in BUST.items():
    img, m = cut(box)
    body = main_component(m)
    ys, _ = np.where(body)
    y0, y1 = ys.min(), ys.max() + 1
    hx = np.where(body[y0:y0 + int((y1 - y0) * 0.5)].any(0))[0]
    cx = (hx.min() + hx.max()) / 2
    big = img.resize((round(img.width * BSCALE), round(img.height * BSCALE)), Image.LANCZOS)
    canvas = Image.new('RGBA', (BW, BH), (0, 0, 0, 0))
    canvas.alpha_composite(big, (round(BW / 2 - cx * BSCALE), round(BH - y1 * BSCALE)))
    meta['bust'][k] = {'file': f'bust-{k}.png'}
    for root in (FILM, APP):
        canvas.save(root / f'bust-{k}.png', optimize=True)
    print('bust', k)

meta['canvas'] = {'full': {'w': CW, 'h': CH, 'feetY': BASE, 'centreX': CW // 2}, 'bust': {'w': BW, 'h': BH}}
meta['note'] = 'Full-body poses share one canvas (feet at feetY, centred on centreX); busts share another. Size them with CSS: the pixels are 2x.'
for root in (FILM, APP):
    (root / 'sprites.json').write_text(json.dumps(meta, indent=1))

# contact sheet on light and dark for a visual check
names = list(FULL) + ['bust-' + k for k in BUST]
tiles = [Image.open(FILM / f'{n}.png') for n in names]
cols = 6
rows = -(-len(tiles) // cols)
sheet = Image.new('RGB', (cols * 340, rows * 400), (244, 247, 252))
for i, t in enumerate(tiles):
    t = t.resize((t.width // 2, t.height // 2), Image.LANCZOS)
    bgc = (244, 247, 252) if (i // cols) % 2 == 0 else (13, 27, 59)
    cell = Image.new('RGBA', (340, 400), bgc + (255,))
    cell.alpha_composite(t, ((340 - t.width) // 2, 400 - t.height - 4))
    sheet.paste(cell.convert('RGB'), ((i % cols) * 340, (i // cols) * 400))
sheet.save('/tmp/claude-0/noora_sheet.jpg', quality=90)
big = Image.new('RGB', (1360, 784), (244, 247, 252))
for i, n in enumerate(['idle', 'talking']):
    t = Image.open(FILM / f'{n}.png')
    bgc = (244, 247, 252) if i == 0 else (13, 27, 59)
    cell = Image.new('RGBA', (680, 784), bgc + (255,))
    cell.alpha_composite(t)
    big.paste(cell.convert('RGB'), (i * 680, 0))
big.save('/tmp/claude-0/noora_big.jpg', quality=92)
