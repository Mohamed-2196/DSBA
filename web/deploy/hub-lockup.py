# Makes the "DSBA Hub" lockup (web/public/brand/hub-lockup-horizontal*.png) from the official DSBA wordmark, which is
# used untouched, plus "Hub" set in Arial Black at the wordmark's cap height and cut by two bands that echo its
# stripes. Needs macOS's Arial Black. Run it again whenever dsba-logo.png changes:
#   uv run --no-project --with pillow python web/deploy/hub-lockup.py
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BRAND = Path(__file__).resolve().parent.parent / "public" / "brand"
FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
BLUE = (20, 54, 144)  # the wordmark's own blue
CAP_TOP, BASELINE = 13, 389  # where the wordmark's letters sit in its 398 px height
SS = 4  # supersampling for clean edges
OUT_HEIGHT = 200
# Each band: centre y at the start and end of "Hub", thickness at the start and end, and how far it arches up.
BANDS = [(272, 294, 16, 10, 28), (324, 346, 22, 12, 28)]

logo = Image.open(BRAND / "dsba-logo.png").convert("RGBA")
white_logo = Image.open(BRAND / "dsba-logo-white.png").convert("RGBA")
width, height = logo.size
cap = BASELINE - CAP_TOP

probe = ImageFont.truetype(FONT, 100 * SS)
box = probe.getbbox("H")
font = ImageFont.truetype(FONT, int(100 * SS * cap * SS / (box[3] - box[1])))
tracking = -int(0.02 * font.size)
glyphs, x = [], 0
for ch in "Hub":
    gb = font.getbbox(ch)
    glyphs.append((ch, x - gb[0]))
    x += gb[2] - gb[0] + tracking
hub_w = x - tracking

word = Image.new("L", (hub_w, height * SS), 0)
draw = ImageDraw.Draw(word)
top = font.getbbox("H")[1]
for ch, gx in glyphs:
    draw.text((gx, CAP_TOP * SS - top), ch, font=font, fill=255)
for y0, y1, t0, t1, bow in BANDS:
    upper, lower = [], []
    for i in range(61):
        u = i / 60
        y = (y0 + (y1 - y0) * u - bow * math.sin(math.pi * u)) * SS
        t = (t0 + (t1 - t0) * u) * SS / 2
        upper.append((u * hub_w, y - t))
        lower.append((u * hub_w, y + t))
    draw.polygon(upper + lower[::-1], fill=0)
word = word.resize((hub_w // SS, height), Image.Resampling.LANCZOS)

gap = int(0.30 * cap)
for name, base, colour in [("hub-lockup-horizontal.png", logo, BLUE), ("hub-lockup-horizontal-white.png", white_logo, (255, 255, 255))]:
    out = Image.new("RGBA", (width + gap + word.width, height), (0, 0, 0, 0))
    out.paste(base, (0, 0))
    ink = Image.new("RGBA", word.size, (*colour, 255))
    ink.putalpha(word)
    out.alpha_composite(ink, (width + gap, 0))
    out = out.crop(out.getbbox())
    out = out.resize((round(out.width * OUT_HEIGHT / out.height), OUT_HEIGHT), Image.Resampling.LANCZOS)
    out.quantize(colors=64, method=Image.Quantize.FASTOCTREE).save(BRAND / name, optimize=True)
    print(name, out.size)
