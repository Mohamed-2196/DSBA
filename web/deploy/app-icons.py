# Makes the installed app's icons (web/public/icons) from the hub's own tile, web/public/brand/dsba-icon.png.
# Run it again whenever that tile changes:
#   uv run --with pillow python web/deploy/app-icons.py
from pathlib import Path

from PIL import Image

PUBLIC = Path(__file__).resolve().parent.parent / "public"
tile = Image.open(PUBLIC / "brand" / "dsba-icon.png").convert("RGBA")
# The tile's own blue, read from its middle edge (the corners are transparent).
blue = tile.getpixel((tile.width // 2, 8))[:3]


def plain(size: int) -> Image.Image:
    """The tile as it is, rounded corners and all ("any" purpose)."""
    return tile.resize((size, size), Image.Resampling.LANCZOS)


def full_bleed(size: int, scale: float) -> Image.Image:
    """The tile on a square of its own blue, the mark shrunk to `scale` (maskable icons and iOS round the corners)."""
    out = Image.new("RGBA", (size, size), (*blue, 255))
    filled = Image.new("RGBA", tile.size, (*blue, 255))
    filled.alpha_composite(tile)  # corners filled first, so no seam shows where the tile ends
    inner = round(size * scale)
    mark = filled.resize((inner, inner), Image.Resampling.LANCZOS)
    offset = (size - inner) // 2
    out.alpha_composite(mark, (offset, offset))
    return out.convert("RGB")


OUT = PUBLIC / "icons"
OUT.mkdir(exist_ok=True)
plain(192).save(OUT / "icon-192.png", optimize=True)
plain(512).save(OUT / "icon-512.png", optimize=True)
# Android crops maskable icons to a circle of 80% of the width: the mark stays inside it.
full_bleed(512, 0.82).save(OUT / "maskable-512.png", optimize=True)
full_bleed(180, 1.0).save(OUT / "apple-touch-icon.png", optimize=True)
