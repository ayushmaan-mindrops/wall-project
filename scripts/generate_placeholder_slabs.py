"""Generate procedural placeholder marble slabs into public/slabs/.

These stand in for the client's real slab scans. Replace the JPGs (and
src/slabs.ts) with high-res, flat, colour-calibrated photos of real stock.

    python scripts/generate_placeholder_slabs.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

W, H = 2400, 1200  # 2:1, like a 3200 x 1600 mm slab
OUT = Path(__file__).resolve().parent.parent / "public" / "slabs"


def fbm(rng, octaves=6, base=4, persistence=0.55):
    """Fractal value noise in [0, 1], built from upsampled random grids."""
    acc = np.zeros((H, W), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        gw, gh = base * 2**o * 2, base * 2**o
        grid = rng.random((gh + 1, gw + 1)).astype(np.float32)
        img = Image.fromarray((grid * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        acc += amp * (np.asarray(img, np.float32) / 255.0)
        total += amp
        amp *= persistence
    return acc / total


def veins(rng, angle, freq, turb, sharp, octaves=6):
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    a = np.deg2rad(angle)
    t = (x * np.cos(a) + y * np.sin(a)) / W * freq * np.pi
    t += (fbm(rng, octaves, 2, 0.5) - 0.5) * turb * 1.1
    v = 1.0 - np.abs(np.sin(t))
    return v**sharp


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def make(spec, seed):
    rng = np.random.default_rng(seed)
    base = hex_rgb(spec["base"])[None, None, :]
    cloud = fbm(rng, 7, 3)[..., None]
    img = base * (1 - spec["cloud"] / 2 + spec["cloud"] * cloud)

    for layer in spec["veins"]:
        v = veins(rng, layer["angle"], layer["freq"], layer["turb"], layer["sharp"], layer.get("octaves", 4))
        # Break veins up so they fade in and out like real stone.
        v *= np.clip(fbm(rng, 4, 2) * 2.2 - 0.6, 0, 1)
        v = np.asarray(
            Image.fromarray((np.clip(v, 0, 1) * 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(layer.get("blur", 1.2))
            ),
            np.float32,
        )[..., None] / 255.0
        col = hex_rgb(layer["color"])[None, None, :]
        img = img * (1 - v * layer["strength"]) + col * v * layer["strength"]

    grain = rng.normal(0, spec.get("grain", 0.012), (H, W, 1)).astype(np.float32)
    img = np.clip(img + grain, 0, 1)
    return Image.fromarray((img * 255).astype(np.uint8))


SPECS = {
    "carrara": dict(
        base="#E6E7E6", cloud=0.10,
        veins=[
            dict(angle=35, freq=9, turb=9, sharp=14, color="#8A9097", strength=0.55),
            dict(angle=-20, freq=16, turb=14, sharp=30, color="#9AA0A6", strength=0.35, blur=0.8),
        ],
    ),
    "calacatta-oro": dict(
        base="#F1EEE8", cloud=0.06,
        veins=[
            dict(angle=55, freq=3, turb=6, sharp=6, color="#6E6A63", strength=0.75, blur=2.0),
            dict(angle=40, freq=6, turb=8, sharp=20, color="#B8995E", strength=0.6),
        ],
    ),
    "statuario": dict(
        base="#F4F4F2", cloud=0.05,
        veins=[
            dict(angle=70, freq=4, turb=10, sharp=10, color="#5F646A", strength=0.7, blur=1.6),
            dict(angle=10, freq=12, turb=12, sharp=28, color="#8D9298", strength=0.4, blur=0.8),
        ],
    ),
    "nero-marquina": dict(
        base="#1B1C1E", cloud=0.12, grain=0.008,
        veins=[
            dict(angle=30, freq=7, turb=10, sharp=22, color="#E8E8E6", strength=0.85, blur=0.9),
            dict(angle=-35, freq=13, turb=12, sharp=40, color="#CFCFCC", strength=0.5, blur=0.7),
        ],
    ),
    "emperador": dict(
        base="#6B4A35", cloud=0.35,
        veins=[
            dict(angle=25, freq=14, turb=16, sharp=24, color="#D9C3A5", strength=0.6, blur=0.8),
            dict(angle=-50, freq=20, turb=18, sharp=36, color="#3C281C", strength=0.5, blur=0.8),
        ],
    ),
    "verde-alpi": dict(
        base="#244236", cloud=0.4, grain=0.01,
        veins=[
            dict(angle=45, freq=18, turb=20, sharp=26, color="#D7E2DA", strength=0.6, blur=0.7),
            dict(angle=-30, freq=10, turb=14, sharp=12, color="#10241C", strength=0.5, blur=1.4),
        ],
    ),
}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for i, (name, spec) in enumerate(SPECS.items()):
        path = OUT / f"{name}.jpg"
        make(spec, 1000 + i).save(path, quality=88, optimize=True)
        print("wrote", path)


