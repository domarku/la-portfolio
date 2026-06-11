// The level format — the single contract between content sources and the engine.
//
// Two things will produce a Level:
//   1. The hand-authored test garden (testGarden.ts), built before any real data exists.
//   2. The DXF importer (Phase 1), which reads a tagged-layer DXF export of a real
//      project and emits exactly this shape.
//
// The renderer never sees DWG/DXF — only this. Everything is in real-world metres,
// X = east, Z = south (Three.js default), Y = up. Keeping it true to scale is the
// whole point: eye height, hedge heights and walking pace are all physically honest.

/** A point on the ground plane, `[x, z]` in metres. Y comes from the terrain. */
export type Vec2 = [number, number];

/** Ground surface materials. Each maps to a placeholder texture in assets.ts. */
export type SurfaceMaterial =
  | "lawn"
  | "meadow"
  | "gravel"
  | "paving"
  | "water"
  | "deck"
  | "soil";

export type WallKind = "wall" | "hedge";

export type PropKind = "tree" | "shrub" | "furniture";

export interface LevelMeta {
  name: string;
  description?: string;
}

/** World extent. The terrain grid spans exactly this rectangle. */
export interface Bounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * A regular heightfield over `bounds`. `heights` is row-major, length `cols * rows`,
 * in metres. The importer produces this by interpolating contours / spot heights;
 * the test garden fills it from a procedural function. Either way the engine only
 * ever reads the sampled grid, so rendered terrain and walk-on collision agree.
 */
export interface Terrain {
  cols: number;
  rows: number;
  heights: number[];
}

/**
 * A closed, tagged polygon painted onto the terrain (drapes to follow it). `water`
 * is the exception: it renders as a flat plane at `level` metres.
 */
export interface Surface {
  id: string;
  material: SurfaceMaterial;
  polygon: Vec2[];
  /** Water surface elevation in metres. Ignored for non-water materials. */
  level?: number;
}

/**
 * A polyline extruded to `height` metres with `thickness` metres of width — a wall
 * or a hedge. (A hedge in this idiom is just a wall with a leafy texture.) Doubles as
 * collision geometry.
 */
export interface Wall {
  id: string;
  kind: WallKind;
  height: number;
  thickness: number;
  path: Vec2[];
}

/** A point feature rendered as a billboard sprite (tree, shrub) or small object. */
export interface Prop {
  id: string;
  kind: PropKind;
  /** Drives which sprite/texture is used, e.g. "oak", "pine", "birch". */
  species?: string;
  position: Vec2;
  /** Sprite height in metres. Defaults per species if omitted. */
  height?: number;
}

/** Where the visitor starts, and which way they face. */
export interface Spawn {
  position: Vec2;
  /** Heading in degrees: 0 = facing north (−Z), 90 = east (+X), clockwise. */
  heading: number;
}

export interface Level {
  meta: LevelMeta;
  bounds: Bounds;
  terrain: Terrain;
  surfaces: Surface[];
  walls: Wall[];
  props: Prop[];
  spawn: Spawn;
  /** Sky / fog colour as a hex int (e.g. 0x9fb6d6). */
  skyColor?: number;
  /** Distance fog as garden haze, in metres. */
  fog?: { near: number; far: number };
}
