#!/usr/bin/env python3
"""Cuts the organisation logos out of the browser-pane screenshots (Wikipedia / the organisations'
own sites, fetched at Mohamed's request on 2 Oct 2026) and writes one PNG per logo slot."""
from pathlib import Path
import numpy as np
from PIL import Image

TR = Path('/root/.claude/projects/-home-claude-dsba/331caa53-7cba-5bfe-8500-672e2c76573d/tool-results')
OUT = Path('/home/claude/dsba/public/logos')
K = 800 / 546                      # screenshot px per CSS px
CW, CH = 273, 204                  # grid cell (CSS px)

def shot(tag):
    f = list(TR.glob(f'*{tag}*.jpg'))
    assert len(f) == 1, (tag, f)
    return Image.open(f[0]).convert('RGB')

def trim(im, pad=10, thr=16, bg=None):
    a = np.asarray(im).astype(np.int16)
    if bg is None:
        bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    diff = np.abs(a - bg).max(-1) > thr
    ys, xs = np.where(diff)
    if not len(xs):
        return im
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + 1 + pad, im.width), min(ys.max() + 1 + pad, im.height))
    return im.crop(box)

def whiten(im, cut=243):
    """JPEG noise in the paper-white background → pure white."""
    a = np.asarray(im).copy()
    m = a.min(-1) >= cut
    a[m] = 255
    return Image.fromarray(a)

def cell(img, col, row, inset=5):
    x0, y0 = col * CW + inset, row * CH + inset
    return img.crop((round(x0 * K), round(y0 * K), round((x0 + CW - 2 * inset) * K), round((y0 + CH - 2 * inset) * K)))

GRID = {
    'fkm8u8': ['nbb', 'citi', 'investcorp', 'cbb', 'pwc', 'stc-bahrain-jpg', 'stc-bahrain', 'mumtalakat'],
    'ubknlk': ['bapco-energies', 'kpmg', 'bahrain-bourse', 'gib', 'deloitte', 'batelco', 'ey', 'mckinsey-old'],
    '09k8m9': ['aws', 'zain-bahrain', 'kfh-bahrain', 'bank-abc', 'bbk', 'alba', 'cfa-mark', 'frm'],
    '5spa77': ['pl300', 'google-da', 'tableau', 'bmc'],
}
logos = {}
for tag, ids in GRID.items():
    img = shot(tag)
    for i, lid in enumerate(ids):
        logos[lid] = whiten(trim(cell(img, i % 2, i // 2)))

# single-logo screenshots
logos['sico'] = whiten(trim(shot('7tc68f')))
b = shot('ayohh6'); logos['benefit'] = whiten(trim(b.crop((0, 0, 800, 600))))
s = shot('ivo2se'); logos['al-salam-bank'] = s.crop((14, 474, 786, 756))       # white type: kept on the dark ground it was shown on
logos['bisb'] = whiten(trim(shot('2tibsz')))
e = shot('a5d99f'); logos['bahrain-edb'] = whiten(trim(e.crop((0, 60, 800, 300)), thr=22), cut=238)
x = shot('nc27hc')
logos['mckinsey'] = whiten(trim(x.crop((0, 0, 800, 400))))
logos['cfa'] = whiten(trim(x.crop((0, 400, 800, 800))))

EMPLOYERS = ['nbb', 'citi', 'investcorp', 'cbb', 'pwc', 'stc-bahrain', 'mumtalakat', 'bapco-energies', 'sico', 'kpmg', 'bahrain-bourse', 'benefit',
             'gib', 'deloitte', 'bahrain-edb', 'batelco', 'ey', 'mckinsey', 'aws', 'zain-bahrain', 'al-salam-bank', 'kfh-bahrain', 'bisb', 'bank-abc', 'bbk', 'alba']
CERTS = {'cfa': 'cfa', 'frm': 'frm', 'pl300': 'pl300', 'aws-ccp': 'aws', 'google-da': 'google-da', 'tableau': 'tableau', 'bmc': 'bmc'}
for d in ('employers', 'certs'):
    (OUT / d).mkdir(parents=True, exist_ok=True)
for lid in EMPLOYERS:
    logos[lid].save(OUT / 'employers' / f'{lid}.png', optimize=True)
for cid, lid in CERTS.items():
    logos[lid].save(OUT / 'certs' / f'{cid}.png', optimize=True)
print({k: v.size for k, v in logos.items()})

# contact sheet for a visual check
names = EMPLOYERS + [f'cert:{c}' for c in CERTS]
ims = [logos[n] for n in EMPLOYERS] + [logos[v] for v in CERTS.values()]
cols, cw, ch = 6, 300, 170
rows = -(-len(ims) // cols)
sheet = Image.new('RGB', (cols * cw, rows * ch), (226, 232, 242))
for i, im in enumerate(ims):
    t = im.copy(); t.thumbnail((cw - 40, ch - 40), Image.LANCZOS)
    tile = Image.new('RGB', (cw - 16, ch - 16), (255, 255, 255))
    tile.paste(t, ((tile.width - t.width) // 2, (tile.height - t.height) // 2))
    sheet.paste(tile, ((i % cols) * cw + 8, (i // cols) * ch + 8))
sheet.save('/tmp/claude-0/logos/sheet.jpg', quality=88)
