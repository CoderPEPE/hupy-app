#!/usr/bin/env python3
"""
Huppy planet art generator.

Renders 8 solar-system planets x 4 mastery levels as 1024x1024 PNGs into
mobile/assets/planets/{slug}/level-{N}.png, matching src/planets/planetLevels.ts.

Each level shows progressive mastery:
  level 1 -> simple, muted, small glow
  level 2 -> features appear
  level 3 -> full detail + atmosphere + stronger glow
  level 4 -> full detail + ring/moons/sparkle + max glow

Regenerate after connecting the Higgsfield MCP (scripts/higgsfield-planet-prompts.sh)
to replace these procedural renders with AI art of the same filenames.
"""

import math
import os
import random
import subprocess
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mobile", "assets", "planets")
# The carousel renders art at <=190pt (<=570px @3x), so 512px is ample and
# keeps the bundle ~3x lighter than 1024px.
SIZE = 512
CX = CY = 256


def stable_seed(*parts):
    """Numeric, process-independent seed (string hashing is randomized per
    process via PYTHONHASHSEED, so we hash explicitly with crc32)."""
    h = 0
    for p in parts:
        h = zlib.crc32(str(p).encode()) ^ ((h << 5) + h)
    return h & 0xFFFFFFFF

# name, slug, base color, accent, planet personality
PLANETS = [
    ("Mercury", "mercury", "#9CA3AF", "#D8DCE3", "rocky"),
    ("Venus", "venus", "#E8B64C", "#F6D98A", "cloudy"),
    ("Earth", "earth", "#4A90D9", "#7FC4F4", "earth"),
    ("Mars", "mars", "#E2574C", "#F09A85", "rocky"),
    ("Jupiter", "jupiter", "#D19A66", "#EEC08A", "bands"),
    ("Saturn", "saturn", "#E0C068", "#F4DEA0", "rings"),
    ("Uranus", "uranus", "#6FC7C9", "#B0E6E8", "icy"),
    ("Neptune", "neptune", "#4A63D9", "#8FA6F0", "ocean"),
]

SPACE = "#0B0E24"


def lighten(hex_color, t):
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    r = int(r + (255 - r) * t)
    g = int(g + (255 - g) * t)
    b = int(b + (255 - b) * t)
    return f"#{r:02x}{g:02x}{b:02x}"


def darken(hex_color, t):
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    r = int(r * (1 - t))
    g = int(g * (1 - t))
    b = int(b * (1 - t))
    return f"#{r:02x}{g:02x}{b:02x}"


def stars(seed, count, spread=0.55):
    rng = random.Random(stable_seed(seed))
    out = []
    for _ in range(count):
        out.append(
            (
                CX + (rng.random() - 0.5) * SIZE * 1.5 * spread,
                CY + (rng.random() - 0.5) * SIZE * 1.5 * spread,
                rng.uniform(0.6, 2.4),
                rng.uniform(0.2, 0.9),
            )
        )
    return out


def craters(seed, count, radius):
    rng = random.Random(stable_seed(seed))
    out = []
    for _ in range(count):
        ang = rng.random() * 2 * math.pi
        dist = rng.random() * radius * 0.75
        out.append(
            (
                CX + math.cos(ang) * dist,
                CY + math.sin(ang) * dist,
                rng.uniform(radius * 0.05, radius * 0.16),
                rng.uniform(0.15, 0.4),
            )
        )
    return out


def bands(color, radius, count):
    out = []
    for i in range(count):
        y = CY - radius + (radius * 2 * (i + 0.5) / count)
        h = radius * (0.05 + (i % 3) * 0.03)
        out.append((y, h))
    return out


def planet_svg(planet, level):
    name, slug, base, accent, personality = planet
    radius = 270
    # progressive sizing + glow
    glow_r = radius * (1.35 + level * 0.06)
    glow_alpha = 0.10 + level * 0.055
    radius = int(radius * (0.9 + level * 0.035))

    parts = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}" viewBox="0 0 {SIZE} {SIZE}">'
    )

    # background space
    parts.append(f'<rect width="{SIZE}" height="{SIZE}" fill="{SPACE}"/>')

    # stars
    star_count = 30 + level * 18
    for x, y, r, o in stars(slug, star_count):
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="rgba(255,255,255,{o:.2f})"/>')

    # soft glow
    parts.append(
        f'<circle cx="{CX}" cy="{CY}" r="{glow_r:.0f}" fill="{base}" opacity="{glow_alpha:.2f}"/>'
    )

    # Saturn / Uranus ring (level >= 2 gets full ring; level 1 a faint hint)
    if personality in ("rings", "icy"):
        ring_alpha = 0.25 if level == 1 else 0.55 + level * 0.1
        ring_rx = radius * 1.75
        ring_ry = radius * 0.55
        ring_color = lighten(base, 0.3) if personality == "rings" else lighten(base, 0.4)
        parts.append(
            f'<g transform="rotate(-22 {CX} {CY})">'
            f'<ellipse cx="{CX}" cy="{CY}" rx="{ring_rx:.0f}" ry="{ring_ry:.0f}" '
            f'fill="none" stroke="{ring_color}" stroke-width="{18 + level * 5}" opacity="{ring_alpha:.2f}"/>'
            f'<ellipse cx="{CX}" cy="{CY}" rx="{ring_rx:.0f}" ry="{ring_ry:.0f}" '
            f'fill="none" stroke="{ring_color}" stroke-width="{5 + level}" opacity="{ring_alpha:.2f}"/>'
            f'</g>'
        )

    # gradient sphere
    grad_id = f"g-{slug}"
    parts.append(
        f'<defs><radialGradient id="{grad_id}" cx="35%" cy="30%" r="80%">'
        f'<stop offset="0%" stop-color="{lighten(base, 0.55)}"/>'
        f'<stop offset="40%" stop-color="{lighten(base, 0.12)}"/>'
        f'<stop offset="100%" stop-color="{darken(base, 0.45)}"/>'
        f'</radialGradient></defs>'
    )

    # personality features drawn behind/on the sphere
    if personality == "bands":
        # Jupiter bands
        for y, h in bands(base, radius, 7 if level >= 3 else 4 if level >= 2 else 2):
            tone = lighten(base, 0.22) if (int(y) % 3 == 0) else darken(base, 0.18)
            parts.append(
                f'<ellipse cx="{CX}" cy="{y:.0f}" rx="{radius:.0f}" ry="{h:.0f}" fill="{tone}" opacity="0.5"/>'
            )
        if level >= 2:
            # great red spot
            parts.append(
                f'<ellipse cx="{CX + radius * 0.22}" cy="{CY + radius * 0.38}" '
                f'rx="{radius * 0.14:.0f}" ry="{radius * 0.09:.0f}" fill="#C96A4A" opacity="0.85"/>'
            )
    elif personality == "earth" and level >= 2:
        # continents (blobby green shapes)
        rng = random.Random(stable_seed("earth", level))
        for _ in range(3 + level):
            x = CX + (rng.random() - 0.5) * radius * 1.3
            y = CY + (rng.random() - 0.5) * radius * 1.3
            rw = rng.uniform(radius * 0.1, radius * 0.28)
            rh = rng.uniform(radius * 0.08, radius * 0.2)
            parts.append(
                f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{rw:.0f}" ry="{rh:.0f}" '
                f'fill="#3FA96B" opacity="0.75" transform="rotate({rng.uniform(0, 180):.0f} {x:.0f} {y:.0f})"/>'
            )
        # clouds
        for x, y, r, o in stars(stable_seed("clouds", level), 8, 0.5):
            parts.append(
                f'<ellipse cx="{CX + (x - CX) * 0.6:.0f}" cy="{CY + (y - CY) * 0.6:.0f}" '
                f'rx="{r * 22:.0f}" ry="{r * 10:.0f}" fill="#FFFFFF" opacity="0.22"/>'
            )
    elif personality == "ocean" and level >= 3:
        # Neptune storm spots
        rng = random.Random(stable_seed("ocean", level))
        for _ in range(level - 1):
            x = CX + (rng.random() - 0.5) * radius * 1.2
            y = CY + (rng.random() - 0.5) * radius * 1.2
            parts.append(
                f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{rng.uniform(18, 40):.0f}" '
                f'ry="{rng.uniform(10, 24):.0f}" fill="#2E44A8" opacity="0.7"/>'
            )
    elif personality == "cloudy" and level >= 3:
        # Venus cloud swirls
        rng = random.Random(stable_seed("venus", level))
        for _ in range(level * 2):
            y = CY + (rng.random() - 0.5) * radius * 1.4
            parts.append(
                f'<ellipse cx="{CX}" cy="{y:.0f}" rx="{radius:.0f}" ry="{rng.uniform(8, 22):.0f}" '
                f'fill="{lighten(base, 0.25)}" opacity="{rng.uniform(0.12, 0.3):.2f}"/>'
            )

    # the sphere (on top of rings so front arc covers; ring drawn earlier is behind)
    parts.append(f'<circle cx="{CX}" cy="{CY}" r="{radius}" fill="url(#{grad_id})"/>')

    # craters for rocky planets
    if personality == "rocky" and level >= 2:
        for x, y, r, o in craters(slug, 3 + level * 2, radius):
            parts.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.0f}" fill="{darken(base, 0.3)}" opacity="{o:.2f}"/>')

    # specular highlight
    hi_alpha = 0.10 + level * 0.02
    parts.append(
        f'<ellipse cx="{CX - radius * 0.28}" cy="{CY - radius * 0.34}" '
        f'rx="{radius * 0.42:.0f}" ry="{radius * 0.2:.0f}" fill="#FFFFFF" opacity="{hi_alpha:.2f}" '
        f'transform="rotate(-28 {CX - radius * 0.28:.0f} {CY - radius * 0.34:.0f})"/>'
    )

    # moons / sparkle at high mastery
    if level >= 4:
        rng = random.Random(stable_seed("moon", slug))
        for _ in range(2):
            ang = rng.random() * 2 * math.pi
            dist = radius * (1.25 + rng.random() * 0.3)
            mx = CX + math.cos(ang) * dist
            my = CY + math.sin(ang) * dist
            parts.append(
                f'<circle cx="{mx:.0f}" cy="{my:.0f}" r="{rng.uniform(10, 20):.0f}" '
                f'fill="{lighten(base, 0.35)}" opacity="0.9"/>'
            )
            parts.append(
                f'<circle cx="{mx - 4:.0f}" cy="{my - 4:.0f}" r="{rng.uniform(3, 6):.0f}" fill="{lighten(base, 0.6)}" opacity="0.6"/>'
            )

    parts.append("</svg>")
    return "".join(parts)


def main():
    if "--help" in sys.argv:
        print(__doc__)
        return 0

    generated = 0
    for planet in PLANETS:
        _, slug, *_ = planet
        pdir = os.path.join(OUT, slug)
        os.makedirs(pdir, exist_ok=True)
        for level in range(1, 5):
            svg_path = os.path.join(pdir, f"level-{level}.svg")
            png_path = os.path.join(pdir, f"level-{level}.png")
            with open(svg_path, "w") as f:
                f.write(planet_svg(planet, level))
            subprocess.run(
                ["qlmanage", "-t", "-s", str(SIZE), "-o", pdir, svg_path],
                check=True,
                capture_output=True,
            )
            # qlmanage names the output "level-N.svg.png" — drop the .svg.
            raw = os.path.join(pdir, f"level-{level}.svg.png")
            if os.path.exists(raw):
                os.replace(raw, png_path)
            os.remove(svg_path)
            generated += 1
            print(f"  {slug}/level-{level}.png")

    print(f"\nDone: {generated} planet PNGs in {OUT}")


if __name__ == "__main__":
    raise SystemExit(main())
