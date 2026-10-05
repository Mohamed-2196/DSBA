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
from PIL import Image
from scipy import ndimage as ndi

SRC = Path('/root/.claude/uploads/331caa53-7cba-5bfe-8500-672e2c76573d/f0c342a1-image.png')
HERE = Path(__file__).resolve().parent
FILM = HERE.parent.parent / 'assets' / 'noora'
APP = Path('/home/claude/dsba/public/noora')
K = 4                                               # the model's enlargement

# cell boxes on the 1254 px sheet (x0, y0, x1, y1), below each label pill
FULL = {
    'idle':       (18, 52, 218, 418),
    'side-right': (262, 52, 452, 418),
    'side-left':  (528, 52, 718, 418),
    'back':       (758, 52, 948, 418),
    'walk-right': (998, 52, 1204, 418),
    'walk-left':  (28, 480, 212, 788),
    'talking':    (224, 480, 438, 788),
    'happy':      (444, 480, 626, 788),
    'excited':    (628, 480, 862, 788),
    'surprised':  (864, 480, 1038, 788),
    'sad':        (1048, 480, 1228, 788),
}
ROW1 = ('idle', 'side-right', 'side-left', 'back', 'walk-right')
BUST = {
    'angry':    (12, 834, 212, 1088),
    'laughing': (218, 834, 398, 1088),
    'winking':  (412, 834, 624, 1088),
    'thinking': (628, 834, 800, 1088),
    'wave':     (826, 834, 1044, 1088),     # the sheet calls it "Bye"
    'neutral':  (1046, 834, 1224, 1088),
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


def enlarge(rgb):
    h, w, _ = rgb.shape
    m = ncnn.Mat.from_pixels(np.ascontiguousarray(rgb), ncnn.Mat.PixelType.PIXEL_RGB, w, h)
    m.substract_mean_normalize([], [1 / 255.0] * 3)
    ex = net.create_extractor()
    ex.input('data', m)
    _, out = ex.extract('output')
    return (np.clip(np.array(out), 0, 1).transpose(1, 2, 0) * 255).round().astype(np.uint8)


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
    big = enlarge(a[y0:y1, x0:x1])
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
