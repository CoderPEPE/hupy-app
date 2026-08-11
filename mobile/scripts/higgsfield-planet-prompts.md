# Higgsfield — solar system planet assets (Hupy Planets tab)

Connect Higgsfield in Cursor first: [Marketplace → Higgsfield](https://cursor.com/marketplace/higgsfield) or `/add-plugin higgsfield`, then sign in.

Generate **32 PNGs** (8 planets × 4 difficulty levels). Save each file to the path shown.

Shared art direction (match the Hupy mockup):

- Pure black or transparent background
- Photorealistic 3D planet, centered
- Subtle purple rim light `#8B7CF6`
- No text, no logos, no UI chrome
- Square 1024×1024 PNG

Difficulty progression (same planet, increasing intensity):

| Level | Lesson | Visual |
|------:|--------|--------|
| 1 | Learn | Soft lighting, calmer, slightly smaller feel, muted |
| 2 | Practice | Brighter, clearer surface detail |
| 3 | Test | Stronger contrast, sharper craters/clouds |
| 4 | Master | Full dramatic lighting, strongest purple glow, “hero” render |

## Output paths

```
mobile/assets/planets/mercury/level-{1-4}.png
mobile/assets/planets/venus/level-{1-4}.png
mobile/assets/planets/earth/level-{1-4}.png
mobile/assets/planets/mars/level-{1-4}.png
mobile/assets/planets/jupiter/level-{1-4}.png
mobile/assets/planets/saturn/level-{1-4}.png  (include rings on all levels)
mobile/assets/planets/uranus/level-{1-4}.png
mobile/assets/planets/neptune/level-{1-4}.png
```

## Prompt template

Use in Cursor with Higgsfield `generate-image`:

```
Hupy mobile app game asset. {PLANET_NAME} planet, difficulty level {LEVEL}/4 ({LEVEL_LABEL}).
Photorealistic 3D sphere on pure black background, no text.
Subtle purple rim light #8B7CF6. {LEVEL_VISUAL_HINT}.
Single planet centered, high detail, app icon quality.
```

### Level visual hints

- **1 Learn:** soft ambient light, gentle, approachable
- **2 Practice:** clearer surface, moderate glow
- **3 Test:** high contrast, dynamic lighting
- **4 Master:** cinematic hero shot, strongest purple aura

### Planet-specific body text

| Planet | Description |
|--------|-------------|
| Mercury | Gray-brown heavily cratered rocky surface |
| Venus | Golden yellow-orange thick clouds |
| Earth | Blue oceans, white clouds, green continents |
| Mars | Red dust, polar ice, craters |
| Jupiter | Banded gas giant, Great Red Spot hint |
| Saturn | Golden gas giant with prominent rings |
| Uranus | Pale cyan-blue ice giant, slight tilt |
| Neptune | Deep blue ice giant, storm spots |

## One-shot agent instruction (after MCP connected)

> Generate all 32 planet PNGs per `scripts/higgsfield-planet-prompts.md` and save under `mobile/assets/planets/`. Use the same style across the set.
