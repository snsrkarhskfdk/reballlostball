from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FRAMES = [0, 15, 30, 45, 59]


def checkerboard(size: tuple[int, int], cell: int = 24) -> Image.Image:
    width, height = size
    img = Image.new("RGB", size, "#f7f6ef")
    draw = ImageDraw.Draw(img)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            if (x // cell + y // cell) % 2 == 0:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#dce5dd")
    return img


def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("artifacts/hero-source/drop-sequence")
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("artifacts/hero-ball-drop-contact-sheet.png")
    out.parent.mkdir(parents=True, exist_ok=True)

    cells: list[Image.Image] = []
    for frame in FRAMES:
        path = root / "frames" / f"reball_ball_drop_{frame:04d}.webp"
        img = Image.open(path).convert("RGBA")
        bg = checkerboard(img.size)
        bg.paste(img, (0, 0), img)
        preview = bg.resize((384, 216), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(preview)
        draw.rectangle((0, 0, 124, 32), fill="#06140E")
        draw.text((12, 8), f"frame {frame:04d}", fill="#FFFFFF")
        cells.append(preview)

    sheet = Image.new("RGB", (384 * len(cells), 216), "#ffffff")
    for index, cell in enumerate(cells):
        sheet.paste(cell, (384 * index, 0))
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main()
