"""Make the web sizes of each slab texture from the masters in assets/slabs-src.

    python scripts/optimize_images.py

Writes public/slabs/<id>.webp (2400 px, visualizer texture), public/slabs/large/<id>.webp
(1400 px, slab page) and public/slabs/thumb/<id>.webp (760 px, cards and swatches).
Drop the client's real slab scans into assets/slabs-src as <id>.jpg and rerun.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'assets' / 'slabs-src', ROOT / 'public' / 'slabs'
for d in (OUT, OUT / 'large', OUT / 'thumb'):
    d.mkdir(parents=True, exist_ok=True)

for master in sorted(SRC.glob('*.jpg')):
    im = Image.open(master).convert('RGB')
    for width, path, q in ((2400, OUT / f'{master.stem}.webp', 82), (1400, OUT / 'large' / f'{master.stem}.webp', 80), (760, OUT / 'thumb' / f'{master.stem}.webp', 72)):
        im.resize((width, round(width * im.height / im.width)), Image.LANCZOS).save(path, quality=q, method=6)
    print('optimized', master.stem)
