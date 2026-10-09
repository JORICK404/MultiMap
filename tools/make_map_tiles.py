"""Режет большую карту (1 пиксель = 1 блок) на тайлы для сайта.

Использование:
    python tools/make_map_tiles.py путь/к/карте.png

Пишет в site/assets/map/:
    low.webp            — уменьшенная карта целиком (видна при отдалении)
    tiles/{x}_{y}.webp  — куски TILE×TILE в полном разрешении (грузятся при приближении)
    meta.json           — размеры, которые читает app.js

Центр картинки считается игровыми координатами 0,0 (для 6001×6001 это −3000…3000).
"""
import json
import os
import shutil
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

TILE = 512
LOW_SIZE = 2048
OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets', 'map')


def main(src):
    im = Image.open(src).convert('RGBA')
    w, h = im.size

    tiles_dir = os.path.join(OUT, 'tiles')
    shutil.rmtree(tiles_dir, ignore_errors=True)
    os.makedirs(tiles_dir)

    cols, rows = -(-w // TILE), -(-h // TILE)
    empty = []
    for ty in range(rows):
        for tx in range(cols):
            # +1 пиксель справа/снизу: соседние тайлы перекрываются, чтобы при
            # дробном масштабе между ними не просвечивали тонкие швы.
            box = (tx * TILE, ty * TILE, min(w, (tx + 1) * TILE + 1), min(h, (ty + 1) * TILE + 1))
            tile = im.crop(box)
            if tile.getchannel('A').getbbox() is None:
                empty.append(f'{tx}_{ty}')
                continue
            tile.save(os.path.join(tiles_dir, f'{tx}_{ty}.webp'), 'WEBP', quality=90, alpha_quality=100, method=6)

    scale = LOW_SIZE / max(w, h)
    low = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    low.save(os.path.join(OUT, 'low.webp'), 'WEBP', quality=88, alpha_quality=100, method=6)

    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump({'width': w, 'height': h, 'tile': TILE, 'empty': empty}, f)

    print(f'{w}x{h}: {cols * rows - len(empty)} тайлов ({len(empty)} пустых пропущено)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
