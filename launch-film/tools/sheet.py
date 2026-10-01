#!/usr/bin/env python3
"""Contact sheets from review stills: python3 tools/sheet.py out/review out/review/sheet 3 [w]"""
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
src, out, cols = sys.argv[1], sys.argv[2], int(sys.argv[3])
cw = int(sys.argv[4]) if len(sys.argv) > 4 else 640
ch = cw * 9 // 16
files = sorted(glob.glob(os.path.join(src, 't_*.png')))
per = cols * (3 if cols >= 3 else 2)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
for s in range(0, len(files), per):
    chunk = files[s:s + per]
    rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cw, rows * ch), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(chunk):
        im = Image.open(f).convert('RGB').resize((cw - 4, ch - 4), Image.LANCZOS)
        x, y = (i % cols) * cw + 2, (i // cols) * ch + 2
        sheet.paste(im, (x, y))
        label = os.path.basename(f)[2:-4].lstrip('0') or '0'
        d.rectangle([x, y, x + 86, y + 26], fill=(0, 0, 0))
        d.text((x + 6, y + 2), label, fill=(255, 225, 74), font=font)
    name = f'{out}_{s // per + 1}.png'
    sheet.save(name)
    print(name)
