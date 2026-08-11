#!/usr/bin/env python3
"""Cuts each planet out of its tile art so it can sit on a light surface.

The flashcard decks show the same planet a learner sees on the Planets tab.
That art (mobile/assets/planet-tiles/<slug>.png) is a flat illustration on an
opaque colored square, so dropping it on a white card shows the square. Here
the background is removed by region-growing from the image border: only
background *connected to the edge* goes, which is what keeps Saturn's gold
body while its equally gold backdrop disappears. The result is cropped to the
planet's bounding box and written to <slug>-orb.png.

Planets without tile art keep falling back to the SVG renderer in
components/PlanetTile.tsx, exactly as the Planets tab does.

Requires ffmpeg (PNG <-> raw RGBA) and numpy. Run: python3 scripts/generate-planet-orbs.py
"""
from __future__ import annotations

import subprocess
import sys
from collections import deque
from pathlib import Path

import numpy as np

ASSETS = Path(__file__).resolve().parent.parent / "mobile" / "assets"
TILES = ASSETS / "planet-tiles"
OUT_DIR = ASSETS / "planet-orbs"
SLUGS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]
OUT_SIZE = 256
# Two adjacent pixels belong to the same flat region below this distance.
# Wide enough to clear a flat backdrop, tight enough to keep Mars's red
# body while its red background goes.
TOLERANCE = 20.0


def load_rgba(path: Path) -> np.ndarray:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(path)],
        capture_output=True, text=True, check=True,
    )
    w, h = (int(v) for v in probe.stdout.strip().split("x"))
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 4).copy()


def save_rgba(img: np.ndarray, path: Path) -> None:
    h, w = img.shape[:2]
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
         "-s", f"{w}x{h}", "-i", "-", "-vf", f"scale={OUT_SIZE}:{OUT_SIZE}", str(path)],
        input=img.tobytes(), check=True,
    )


def background_mask(img: np.ndarray) -> np.ndarray:
    """True where a pixel is background: connected to the image border *and*
    still the color that border started with.

    Both halves matter. Connectivity is what keeps Saturn's gold body while
    its equally gold backdrop goes. Comparing against the seed color (not the
    neighbor) is what stops the fill from walking down a planet's own gradient
    one small step at a time and eating it."""
    h, w = img.shape[:2]
    rgb = img[:, :, :3].astype(np.int16)
    seen = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int, np.ndarray]] = deque()

    for y, x in [(0, i) for i in range(w)] + [(h - 1, i) for i in range(w)] + \
                [(i, 0) for i in range(h)] + [(i, w - 1) for i in range(h)]:
        if not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x, rgb[y, x]))

    while queue:
        y, x, seed = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                if np.linalg.norm(rgb[ny, nx] - seed) <= TOLERANCE:
                    seen[ny, nx] = True
                    queue.append((ny, nx, seed))
    return seen


def radial_cut(img: np.ndarray) -> np.ndarray:
    """Alpha mask for the generated level art, where the planet is a centered
    sphere filling the frame edge to edge. Connectivity is useless there: the
    sphere touches the border, so a fill seeded on it walks straight down the
    shaded limb and eats the planet."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.hypot(yy - h / 2, xx - w / 2)
    solid, edge = 0.462 * w, 0.492 * w
    alpha = np.clip((edge - dist) / (edge - solid), 0, 1)
    img[:, :, 3] = (img[:, :, 3] * alpha).astype(np.uint8)
    return img


def cut_out(path: Path, illustrated: bool) -> np.ndarray:
    img = load_rgba(path)
    if not illustrated:
        return radial_cut(img)

    bg = background_mask(img)
    img[bg, 3] = 0

    # Trim to what's left, keeping it square so the planet stays round.
    ys, xs = np.nonzero(~bg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = max(y1 - y0, x1 - x0)
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    half = side // 2 + 2
    h, w = img.shape[:2]
    top, left = max(0, cy - half), max(0, cx - half)
    return img[top:min(h, cy + half), left:min(w, cx + half)]


def source_for(slug: str) -> Path | None:
    """The illustrated tile when one exists, otherwise the generated level art
    — the same order of preference the Planets tab renders in."""
    for candidate in (TILES / f"{slug}.png", ASSETS / "planets" / slug / "level-4.png"):
        if candidate.exists():
            return candidate
    return None


def main() -> int:
    OUT_DIR.mkdir(exist_ok=True)
    missing = True
    for slug in SLUGS:
        src = source_for(slug)
        if src is None:
            print(f"skip {slug} (no art)", file=sys.stderr)
            continue
        missing = False
        out = OUT_DIR / f"{slug}.png"
        save_rgba(cut_out(src, illustrated=src.parent == TILES), out)
        print(f"wrote {out.relative_to(ASSETS.parent)} (from {src.name})")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
