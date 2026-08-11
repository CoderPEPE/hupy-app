#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Huppy — Higgsfield MCP planet art prompts
#
# The app ships procedural planet PNGs (scripts/generate-planet-art.py) under
# mobile/assets/planets/{slug}/level-{1-4}.png. Once the Higgsfield MCP is
# connected and authenticated, regenerate them as AI art with the same
# filenames so the app keeps working unchanged.
#
#   Connect:   claude mcp list                      # higgsfield: needs auth
#              claude mcp auth-login higgsfield     # or authenticate in Cursor
#   Regenerate: run this script and save each image as
#              mobile/assets/planets/{slug}/level-{N}.png  (1024x1024 PNG)
#
# Each planet has 4 mastery levels — the image should grow progressively more
# vivid: level 1 = simple/muted, level 4 = full detail + glow + moons.
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Huppy Higgsfield prompts — save outputs to: $ROOT/mobile/assets/planets/{slug}/level-{N}.png"
echo

PROMPTS=(
  # Mercury — gray, heavily cratered
  "Mercury planet, full globe, gray rocky surface densely covered with impact craters, NASA style, deep space background with stars, centered, no text"
  "Mercury planet, close-up surface with large craters and ridges, soft light from upper left, dark space background, photorealistic"
  "Mercury planet, detailed terrain with craters and smooth plains, subtle purple glow around the planet, cinematic lighting"
  "Mercury planet, ultra detailed surface, glowing purple atmosphere rim, small moon nearby, stars and nebula in background, epic"
  # Venus — golden, thick clouds
  "Venus planet, full globe, thick golden-yellow swirling clouds, NASA style, deep space background, centered, no text"
  "Venus planet, creamy yellow cloud bands swirling, soft light, dark space background, photorealistic"
  "Venus planet, dense swirling cloud layers in gold and amber, subtle glow, cinematic"
  "Venus planet, brilliant golden clouds, glowing atmosphere, small moon, stars, epic render"
  # Earth — blue marble
  "Earth planet, full globe, blue oceans with green continents and white clouds, NASA style, deep space background, centered, no text"
  "Earth planet, blue marble with visible continents and clouds, soft light, dark space, photorealistic"
  "Earth planet, detailed continents, swirling clouds, subtle blue glow, cinematic"
  "Earth planet, ultra detailed, glowing blue atmosphere, small moon, stars, epic"
  # Mars — red, rocky
  "Mars planet, full globe, reddish-orange rocky surface, dark basalt regions, NASA style, deep space background, centered, no text"
  "Mars planet, rusty red terrain with canyon and polar ice cap, soft light, dark space, photorealistic"
  "Mars planet, detailed red surface with dust storms, subtle glow, cinematic"
  "Mars planet, ultra detailed red surface, glowing atmosphere, two small moons, stars, epic"
  # Jupiter — bands + great red spot
  "Jupiter planet, full globe, horizontal cloud bands in tan, brown and cream with the great red spot, NASA style, deep space, centered, no text"
  "Jupiter planet, swirling cloud bands, great red spot clearly visible, soft light, dark space, photorealistic"
  "Jupiter planet, detailed turbulent bands, prominent great red spot, subtle glow, cinematic"
  "Jupiter planet, ultra detailed bands, glowing atmosphere, four small moons, stars, epic"
  # Saturn — rings
  "Saturn planet, full globe, pale gold with distinct rings at an angle, NASA style, deep space background, centered, no text"
  "Saturn planet, golden globe with detailed icy rings, soft light, dark space, photorealistic"
  "Saturn planet, detailed globe and layered rings, subtle glow, cinematic"
  "Saturn planet, ultra detailed rings with gaps, glowing atmosphere, several moons, stars, epic"
  # Uranus — pale cyan, faint ring
  "Uranus planet, full globe, smooth pale cyan, faint vertical ring, NASA style, deep space background, centered, no text"
  "Uranus planet, pale cyan globe with faint thin ring, soft light, dark space, photorealistic"
  "Uranus planet, smooth cyan surface, subtle glow, faint ring, cinematic"
  "Uranus planet, glowing cyan, faint rings, small moons, stars, epic"
  # Neptune — deep blue with storms
  "Neptune planet, full globe, deep blue with dark storm spots, NASA style, deep space background, centered, no text"
  "Neptune planet, vivid blue with the great dark spot, soft light, dark space, photorealistic"
  "Neptune planet, deep blue with storm bands, subtle glow, cinematic"
  "Neptune planet, ultra detailed blue storms, glowing atmosphere, small moon, stars, epic"
)

SLUGS=(mercury venus earth mars jupiter saturn uranus neptune)
i=0
for slug in "${SLUGS[@]}"; do
  for level in 1 2 3 4; do
    echo "── ${slug}/level-${level} ──"
    echo "Prompt: ${PROMPTS[$i]}"
    echo "Save as: ${ROOT}/mobile/assets/planets/${slug}/level-${level}.png"
    echo
    i=$((i + 1))
  done
done

echo "Tip: ask your agent to call the Higgsfield image-generation MCP tool with"
echo "each prompt, save the result to the path shown, then run:"
echo "  cd $ROOT/mobile && npx tsc --noEmit"
