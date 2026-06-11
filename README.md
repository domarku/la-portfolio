# Garden walk

A first-person, low-fi walkthrough of landscape-architecture projects — walk through a
built garden like an early-90s FPS, with the emphasis on experiencing the space at true
scale. Real 3D (Three.js) wearing a retro costume: a low-resolution render buffer,
nearest-neighbour upscaling, a posterised palette, distance fog, and billboard plants.

This is the **Phase 0 prototype**. It runs on a hand-authored fictional garden — no real
project data yet — and exists to validate the look, the level format, and the controls,
and to let the architect choose an aesthetic by walking it.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Deploy

Static site, no server. Vercel auto-detects Vite; `vercel.json` pins it explicitly
(`npm run build` → `dist/`). Connect the GitHub repo in the Vercel dashboard and it
builds on every push. (`base: "./"` in `vite.config.ts` keeps asset paths relative, so
it also works from a subpath like GitHub Pages.)

## Controls

- **click** — enter (pointer lock)
- **WASD** / arrows — move · **mouse** — look · **shift** — run
- **M** — toggle Doom-style (smooth terrain) ↔ Minecraft-style (voxelised)
- **Tab** — plan / automap
- **esc** — release cursor

## What's here

Two render modes consume the **same level data**, so the aesthetic is a renderer choice,
not a data choice:

- **Continuous (Doom-style)** — real heightfield terrain, draped surfaces, billboard
  trees. Curves stay curves.
- **Voxel (Minecraft-style)** — the same level rasterised onto a 0.5 m block grid.
  Curves become staircases, the ground steps. The point is to *see* her curves voxelised
  before deciding whether it's charming or sacrilege.

Navigation and collision are identical between modes; only the look changes.

## Structure

```
src/
  level/
    schema.ts       The level format — the contract the DXF importer will target.
    testGarden.ts   The hand-authored fictional garden, written in that format.
  engine/
    heightfield.ts  Bilinear terrain sampler (shared by rendering and walk-on collision).
    assets.ts       Procedural placeholder textures + tree sprites (stand-ins for CC0 art).
    world.ts        Continuous build: terrain, draped surfaces, extruded walls, billboards.
    voxel.ts        Voxel build: block terrain with per-cell material, crossed-quad trees.
    player.ts       Pointer-lock look, WASD, terrain-follow, head-bob, collision.
    retro.ts        Low-res buffer + nearest upscale + palette posterise + dither.
    automap.ts      Top-down plan overlay with live player marker.
    app.ts          Wires it together; owns the renderer, scene, loop, HUD.
  main.ts           Boots GardenApp with the test garden.
```

## The level format

`src/level/schema.ts` is the single source of truth. Everything is in real-world metres
(X east, Z south, Y up). A `Level` has bounds, a heightfield, tagged surface polygons,
walls/hedges (polyline + height), point props (trees), and a spawn. The test garden is
written by hand in this shape; the Phase 1 importer will emit the identical shape from a
tagged-layer DXF export of a real project.

## Deliberately deferred (Phase 1+)

- **DXF importer** — the only piece that genuinely needs real project files. It targets
  the level format above, so it can be written against a real cleaned-up DXF without
  touching the engine.
- Real art (CC0 pixel textures/sprites) replacing the procedural placeholders.
- Mobile controls / guided-tour mode; the architect's real plan as the automap image.
- Seasonal palette swaps (a texture-atlas swap; nothing in the architecture blocks it).
