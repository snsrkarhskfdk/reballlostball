from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw


FRAMES = [0, 15, 30, 45, 52, 59]
DEFAULT_ROOT = Path(r"C:\리볼_로스트볼\blender\asset\hero-flight")


def checkerboard(size: tuple[int, int], cell: int = 24) -> Image.Image:
    width, height = size
    img = Image.new("RGB", size, "#f7f6ef")
    draw = ImageDraw.Draw(img)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            fill = "#dce5dd" if (x // cell + y // cell) % 2 == 0 else "#ffffff"
            draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=fill)
    return img


def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_ROOT
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "contact_sheet.png"
    frames_dir = root / "frames"
    out.parent.mkdir(parents=True, exist_ok=True)

    cells: list[Image.Image] = []
    for frame in FRAMES:
        path = frames_dir / f"hero_ball_flight_{frame:04d}.png"
        img = Image.open(path).convert("RGBA")
        bg = checkerboard(img.size)
        bg.paste(img, (0, 0), img)
        preview = bg.resize((384, 216), Image.Resampling.LANCZOS)
        draw = ImageDraw.Draw(preview)
        draw.rectangle((0, 0, 130, 32), fill="#06140E")
        draw.text((12, 8), f"frame {frame:04d}", fill="#FFFFFF")
        cells.append(preview)

    sheet = Image.new("RGB", (384 * len(cells), 216), "#ffffff")
    for index, cell in enumerate(cells):
        sheet.paste(cell, (384 * index, 0))
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main()
