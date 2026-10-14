# Makes the installed app's icons (web/public/icons) and the favicon from the hub's tile masters:
#   web/public/brand/hub-icon-1024.png           opaque blue square, "DH" at about two thirds of the width
#   web/public/brand/hub-icon-maskable-1024.png  the same with the mark inside Android's central 80% circle
# Run it again whenever those change:
#   uv run --no-project --with pillow python web/deploy/app-icons.py
from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "public"
BRAND = PUBLIC / "brand"
tile = Image.open(BRAND / "hub-icon-1024.png").convert("RGBA")
maskable = Image.open(BRAND / "hub-icon-maskable-1024.png").convert("RGBA")
RADIUS = 0.225  # the "any" icons' corner, as a share of the side


def rounded(size: int) -> Image.Image:
    """The tile with rounded, transparent corners ("any" purpose, favicon, in-app tile)."""
    big = tile.copy()
    corners = Image.new("L", big.size, 0)
    ImageDraw.Draw(corners).rounded_rectangle((0, 0, big.width - 1, big.height - 1), round(big.width * RADIUS), fill=255)
    big.putalpha(corners)
    return big.resize((size, size), Image.Resampling.LANCZOS)


def square(source: Image.Image, size: int) -> Image.Image:
    """Full bleed (maskable icons and iOS round the corners themselves)."""
    return source.resize((size, size), Image.Resampling.LANCZOS).convert("RGB")


OUT = PUBLIC / "icons"
OUT.mkdir(exist_ok=True)
rounded(192).save(OUT / "icon-192.png", optimize=True)
rounded(512).save(OUT / "icon-512.png", optimize=True)
square(maskable, 512).save(OUT / "maskable-512.png", optimize=True)
square(tile, 180).save(OUT / "apple-touch-icon.png", optimize=True)
rounded(64).save(PUBLIC / "favicon.png", optimize=True)
square(tile, 512).save(BRAND / "hub-icon.png", optimize=True)
