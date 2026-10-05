#!/usr/bin/env python3
"""Cuts Mohamed's "Mini Noora" sprite sheet (a generated sheet, 1254 px, with a checkerboard baked in
as its background) into transparent PNGs, one per pose, normalised so poses can be swapped in place.

  python3 tools/noora/cut_sprites.py     -> assets/noora/*.png (+ sprites.json) and the app's public/noora/

The sheet is small (a figure is about 350 px tall), so each pose is first enlarged 4x with the
Real-ESRGAN anime model (run on the CPU with ncnn: `pip install ncnn`; the two model files,
realesrgan-x4plus-anime.param and .bin, come from the Real-ESRGAN ncnn release zip on GitHub and go in
tools/noora/models/, which is not committed), the
background is cut at that size, and the result is saved at 2x the sheet's scale. The enlarged cells are
kept in tools/noora/work/ (not committed either), so a second run only redoes the cutting; `--warm` makes
just those.

What has to go, besides the checkerboard: the pale fringe the sheet's compression leaves along her outline,
the pale glow it gives every mark drawn beside her, the backdrop caught between two strokes of a mark or
between her hand and her hijab, and the backdrop still mixed into the soft edge of her outline (a light rim
on anything dark). Check a re-cut on a dark and on a saturated background: none of this shows on white.

Full-body poses share one canvas (same body scale, feet on one baseline); the half-body poses of the
sheet's third row ("busts") share another (heads aligned).
"""
import json
import sys
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
    'excited':    (640, 494, 875, 818),     # wide enough for the dashes either side of her and their soft edges
    'surprised':  (873, 494, 1052, 818),
    'sad':        (1054, 494, 1244, 818),
}
ROW1 = ('idle', 'side-right', 'side-left', 'back', 'walk-right')
BUST = {
    'angry':    (14, 862, 240, 1113),
    'laughing': (242, 862, 445, 1118),
    'winking':  (447, 862, 670, 1118),
    'thinking': (672, 862, 852, 1118),
    'wave':     (854, 862, 1064, 1118),     # the sheet calls it "Bye"; its wave lines end 2 px short of "Neutral"
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
# Backdrop that the figure encloses (a bay between her raised hand and her hijab) cannot be told from the white
# of an eye or of her badge by its colour or its two tones, so these are named: a point inside each such pocket
# on this sheet (x, y). Everything else that is enclosed stays part of her.
POCKETS = [(1009, 987), (1022, 962)]          # "Bye": between arm, hand and hijab; and beside her fingers
for (px, py) in POCKETS:
    assert cand[py, px], f'pocket seed {(px, py)} is not on the backdrop'
    bg |= lab == lab[py, px]
# The sheet's compression leaves a pale, faintly tinted fringe along her outline, a pixel or three wide, which
# the test above does not take for checkerboard. It is backdrop as well: pale pixels joined to the backdrop,
# and no deeper than three (her hijab is just as pale, so a gap in her outline must not let this run into it).
fringe = (mn >= 205) & (mx - mn <= 45)
for _ in range(3):
    bg |= ndi.binary_dilation(bg) & fringe
fg = ~bg

# The marks drawn beside her (the wave lines, the dashes of "Excited", the star, the anger mark) are strokes of
# strong yellow or red standing in the open: a blob of such a colour with pale all around it. (Her mouth and
# her buttons have these colours too, with skin or navy around them.) They get their own, colour-keyed cut-out
# in cut(): the sheet gives each a pale glow that would otherwise come along as a white rim, and the backdrop
# between two strokes is neither "her" nor "outside".
R_, G_, B_ = ai[..., 0], ai[..., 1], ai[..., 2]
strong = ((R_ >= 215) & (G_ >= 150) & (B_ <= 110) & (R_ - B_ >= 120)) | ((R_ >= 185) & (G_ <= 120) & (B_ <= 110) & (R_ - G_ >= 90))
ink = np.zeros(strong.shape, bool)
lm, _ = ndi.label(strong, structure=np.ones((3, 3)))
for i, sl in enumerate(ndi.find_objects(lm), 1):
    ys = slice(max(0, sl[0].start - 4), sl[0].stop + 4)
    xs = slice(max(0, sl[1].start - 4), sl[1].stop + 4)
    blob = lm[ys, xs] == i
    if blob.sum() < 40:
        continue
    ring = ndi.binary_dilation(blob, iterations=3) & ~ndi.binary_dilation(blob, iterations=1)
    if (mn[ys, xs] >= 200)[ring].mean() >= 0.6:
        ink[ys, xs] |= blob
MARK = ndi.distance_transform_edt(~ink) <= 3.5      # a mark with its soft edge and glow; the figure is never this close

WORK = HERE / 'work'                                 # enlarged cells are kept here (not committed): a minute each to make
_net = None


def model():
    global _net
    if _net is None:
        _net = ncnn.Net()
        _net.opt.use_vulkan_compute = False
        _net.opt.num_threads = 2
        _net.load_param(str(HERE / 'models' / 'realesrgan-x4plus-anime.param'))
        _net.load_model(str(HERE / 'models' / 'realesrgan-x4plus-anime.bin'))
    return _net


def enlarge_one(rgb):
    h, w, _ = rgb.shape
    m = ncnn.Mat.from_pixels(np.ascontiguousarray(rgb), ncnn.Mat.PixelType.PIXEL_RGB, w, h)
    m.substract_mean_normalize([], [1 / 255.0] * 3)
    ex = model().create_extractor()
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


def enlarged(box):
    """The K x enlargement of one cell of the sheet, from tools/noora/work/ when it has been made before."""
    x0, y0, x1, y1 = box
    f = WORK / f'{SRC.stem}_{x0}_{y0}_{x1}_{y1}.png'
    if f.exists():
        return np.asarray(Image.open(f).convert('RGB'))
    big = enlarge(a[y0:y1, x0:x1])
    WORK.mkdir(exist_ok=True)
    Image.fromarray(big).save(f)
    return big


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


def upscale(mask, shape):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((shape[1], shape[0]), Image.BICUBIC)) > 127


def cut(box):
    """-> RGBA image at K x, and the boolean mask of her body at that size."""
    x0, y0, x1, y1 = box
    near = MARK[y0:y1, x0:x1]
    body1 = main_component(fg[y0:y1, x0:x1] & ~near)           # she is one piece; anything else in the cell is a neighbour, a label or noise
    # the marks of this cell are the ones that lie wholly inside it; the glow of a neighbour's mark may reach in
    lz, _ = ndi.label(near, structure=np.ones((3, 3)))
    cut_off = np.unique(np.concatenate([lz[0], lz[-1], lz[:, 0], lz[:, -1]]))
    zone1 = near & ~np.isin(lz, cut_off[cut_off > 0])
    assert not (ink[y0:y1, x0:x1] & near & ~zone1).any(), f'a mark is cut by the edge of cell {box}'
    big, badges = keep_badge(a[y0:y1, x0:x1], enlarged(box))
    print('  cell', box, 'badge restored' if badges else 'no badge found', 'marks' if zone1.any() else '', flush=True)
    bi = big.astype(np.int16)
    low, chroma = bi.min(-1), bi.max(-1) - bi.min(-1)
    up = upscale(body1, big.shape)
    sure_fg = ndi.binary_erosion(up, iterations=7)
    sure_bg = ndi.binary_erosion(~up, iterations=7, border_value=1)
    band = ~sure_fg & ~sure_bg
    # In the band along her edge the enlarged picture decides. She is drawn with a dark outline all round, so
    # anything light that can be reached from outside without crossing that line is backdrop: the checkerboard
    # itself, and the faintly tinted fringe the sheet's compression leaves beside the line.
    light = ((chroma <= 12) & (low >= 226)) | ((chroma <= 40) & (low >= 205))
    maybe_bg = sure_bg | (band & light)
    l3, _ = ndi.label(maybe_bg)
    outside = np.unique(l3[sure_bg])
    bgK = np.isin(l3, outside[outside > 0])
    mK = ndi.binary_opening(~bgK, iterations=1)
    mK = main_component(mK)
    # a crumb of backdrop shut in where two of her outlines meet (between two fingers) becomes line as well:
    # a few bright pixels near her edge with the dark of the line all round them
    l4, _ = ndi.label(mK & (low >= 170))
    size = np.bincount(l4.ravel())
    rim = mK & ~ndi.binary_erosion(mK, iterations=10)
    dark = bi.max(-1) < 150
    crumb = np.zeros(mK.shape, bool)
    spots = ndi.find_objects(l4)
    for i in np.unique(l4[rim]):
        if not i or size[i] >= 80:
            continue
        sl = tuple(slice(max(0, s_.start - 3), s_.stop + 3) for s_ in spots[i - 1])
        spot = l4[sl] == i
        ring = ndi.binary_dilation(spot, iterations=2) & ~spot & mK[sl]
        if ring.any() and dark[sl][ring].mean() >= 0.75:
            crumb[sl] |= spot
    if crumb.any():
        big = np.where(ndi.binary_dilation(crumb, iterations=1)[..., None], ndi.minimum_filter(big, size=(11, 11, 1)), big)
    core = ndi.binary_erosion(mK, iterations=2)
    alpha = np.clip(ndi.gaussian_filter(core.astype(np.float32), 1.6) * 1.35, 0, 1)
    alpha[~ndi.binary_dilation(mK, iterations=1)] = 0
    # Where the cut-out is soft, the picture still has the backdrop mixed into her outline, which shows as a
    # light rim on anything dark. Those pixels take the darkest colour within three pixels: the line itself.
    soft = (alpha > 0) & (alpha < 0.995)
    big = np.where(soft[..., None], ndi.minimum_filter(big, size=(7, 7, 1)), big)
    if zone1.any():
        # The marks: a pixel is as opaque as it is far from the backdrop's pale neutral, less the pale glow the
        # sheet gives every stroke, and whatever a mark fully encloses (the light on the star) stays solid.
        zone = upscale(zone1, big.shape)
        stroke = upscale(ndi.binary_erosion(ink[y0:y1, x0:x1], iterations=1), big.shape)
        lowf = low.astype(np.float32)
        level = float(np.percentile(lowf[stroke], 25)) if stroke.any() else 60.0
        am = np.clip((226.0 - lowf) / max(40.0, 226.0 - level - 30.0), 0, 1) * zone
        am = np.clip((am - 0.2) / 0.8, 0, 1)                     # without the glow, and the traces the enlarger leaves of its outer edge
        solid = ndi.binary_fill_holes(am > 0.6)
        lz2, _ = ndi.label(am > 0.15)
        joined = np.unique(lz2[solid])
        am *= ndi.binary_dilation(np.isin(lz2, joined[joined > 0]), iterations=2)     # only what is joined to a stroke
        am = np.maximum(am, solid.astype(np.float32))
        am = ndi.gaussian_filter(am, 0.7) * zone
        # the soft edge of a stroke takes the stroke's own colour (in the picture it is mixed with the backdrop)
        iy, ix = ndi.distance_transform_edt(~ndi.binary_erosion(solid, iterations=2), return_distances=False, return_indices=True)
        edge = (am > alpha) & ~ndi.binary_erosion(solid, iterations=2)
        big = np.where(edge[..., None], big[iy, ix], big)
        alpha = np.maximum(alpha, am)
    ys, xs = np.where(alpha > 0.02)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    out = np.dstack([big, (alpha * 255).round().astype(np.uint8)])[by0:by1, bx0:bx1]
    return Image.fromarray(out, 'RGBA'), mK[by0:by1, bx0:bx1]


def main_component(m):
    l2, k = ndi.label(m, structure=np.ones((3, 3)))
    return l2 == (np.bincount(l2.ravel())[1:].argmax() + 1)


def body_rows(m):
    ys, _ = np.where(main_component(m))
    return ys.min(), ys.max() + 1


def feet_x(m, y1):
    y0, _ = body_rows(m)
    rows = m[int(y0 + (y1 - y0) * 0.93):y1]
    xs = np.where(rows.any(0))[0]
    return (xs.min() + xs.max()) / 2


def main():
    if '--warm' in sys.argv:                # only make the enlargements
        for k_, b_ in {**FULL, **{'bust-' + k: v for k, v in BUST.items()}}.items():
            enlarged(b_)
            print('enlarged', k_, flush=True)
        return

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


if __name__ == '__main__':
    main()
