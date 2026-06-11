import type { Level, Vec2 } from "./schema";

// A fictional ~30 × 20 m garden, authored directly in the level format. It exists to
// validate the schema, the renderer and the feel of real-world scale before any real
// project data arrives — and it deliberately includes every feature the engine must
// handle: gentle grade, a raised terrace, a sunken pond with standing water, hedges of
// two heights, a retaining wall, a curving gravel path, and trees of three species.
//
// Terrain is filled from a procedural function below, exactly mirroring how the DXF
// importer will later fill it from interpolated contours — same grid, same units.

const MIN_X = -15;
const MAX_X = 15;
const MIN_Z = -10;
const MAX_Z = 10;
const COLS = 31; // 1 m grid
const ROWS = 21;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** ~1 inside [lo, hi], ramping to 0 over `m` metres at each edge. */
function band(v: number, lo: number, hi: number, m: number): number {
  return smoothstep(lo - m, lo, v) - smoothstep(hi, hi + m, v);
}

/** The ground surface. The renderer and the player both read the sampled grid. */
function heightAt(x: number, z: number): number {
  // Gentle east-rising grade plus soft undulation.
  let h = 0.02 * (x - MIN_X) + 0.15 * Math.sin(x * 0.4) * Math.cos(z * 0.5);

  // Raised terrace in the north-east, blended over a 2 m margin.
  const terrace = band(x, 5, 13, 2) * band(z, -9, -1, 2);
  h = h * (1 - terrace) + 1.2 * terrace;

  // Sunken pond bowl in the west.
  const pond = 1 - smoothstep(0, 3.4, Math.hypot(x + 6, z - 3));
  h -= 0.85 * pond;

  return h;
}

function buildTerrain(): number[] {
  const dx = (MAX_X - MIN_X) / (COLS - 1);
  const dz = (MAX_Z - MIN_Z) / (ROWS - 1);
  const heights: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    const z = MIN_Z + r * dz;
    for (let c = 0; c < COLS; c++) {
      heights.push(heightAt(MIN_X + c * dx, z));
    }
  }
  return heights;
}

/** Turn a centerline into a closed strip polygon of the given width — used for paths. */
function strip(centerline: Vec2[], width: number): Vec2[] {
  const half = width / 2;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < centerline.length; i++) {
    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(centerline.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    // Left normal of the travel direction.
    const nx = -dz / len;
    const nz = dx / len;
    const [px, pz] = centerline[i];
    left.push([px + nx * half, pz + nz * half]);
    right.push([px - nx * half, pz - nz * half]);
  }
  return [...left, ...right.reverse()];
}

function circle(cx: number, cz: number, r: number, segs: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return pts;
}

function rect(x0: number, z0: number, x1: number, z1: number): Vec2[] {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

const PATH_CENTERLINE: Vec2[] = [
  [-10, 9],
  [-8, 5.5],
  [-4.5, 2.5],
  [-1, 0.5],
  [3, -1.5],
  [6.5, -3],
  [9, -4.5],
];

export function buildTestGarden(): Level {
  return {
    meta: {
      name: "Test garden",
      description: "A fictional garden for validating the walker — not a real project.",
    },
    bounds: { minX: MIN_X, minZ: MIN_Z, maxX: MAX_X, maxZ: MAX_Z },
    terrain: { cols: COLS, rows: ROWS, heights: buildTerrain() },
    surfaces: [
      // Base lawn covers the whole plot; everything else draws on top.
      { id: "lawn", material: "lawn", polygon: rect(MIN_X, MIN_Z, MAX_X, MAX_Z) },
      { id: "path", material: "gravel", polygon: strip(PATH_CENTERLINE, 1.8) },
      { id: "terrace", material: "paving", polygon: rect(6, -8, 12, -2) },
      { id: "deck", material: "deck", polygon: rect(-8.5, 5.5, -4.5, 7.2) },
      { id: "pond", material: "water", polygon: circle(-6, 3, 3.2, 28), level: 0.0 },
    ],
    walls: [
      // Tall boundary hedges (1.8 m) along the north and west edges.
      { id: "hedge-n", kind: "hedge", height: 1.8, thickness: 0.6, path: [[-14, -9], [3, -9]] },
      { id: "hedge-w", kind: "hedge", height: 1.8, thickness: 0.6, path: [[-14, -9], [-14, 8]] },
      // A low clipped hedge (0.6 m) edging the path.
      {
        id: "hedge-low",
        kind: "hedge",
        height: 0.6,
        thickness: 0.5,
        path: [[-7, 4.4], [-3.5, 1.6], [0.5, -0.4], [4.5, -2.4]],
      },
      // Retaining walls holding the terrace, leaving a gap (x 8–10) for the path up.
      { id: "retain-a", kind: "wall", height: 0.6, thickness: 0.4, path: [[6, -2], [8, -2]] },
      { id: "retain-b", kind: "wall", height: 0.6, thickness: 0.4, path: [[10, -2], [12, -2]] },
    ],
    props: [
      { id: "t1", kind: "tree", species: "oak", position: [-12, 6] },
      { id: "t2", kind: "tree", species: "oak", position: [11, 7] },
      { id: "t3", kind: "tree", species: "oak", position: [-2.5, 8] },
      { id: "t4", kind: "tree", species: "oak", position: [7.5, 3] },
      { id: "t5", kind: "tree", species: "pine", position: [-13, -6] },
      { id: "t6", kind: "tree", species: "pine", position: [-10.5, -2] },
      { id: "t7", kind: "tree", species: "pine", position: [2, -7] },
      { id: "t8", kind: "tree", species: "pine", position: [13, -8] },
      { id: "t9", kind: "tree", species: "birch", position: [-9, -4] },
      { id: "t10", kind: "tree", species: "birch", position: [-4.5, -6] },
      { id: "t11", kind: "tree", species: "birch", position: [-12, 2] },
      { id: "t12", kind: "tree", species: "birch", position: [12, 3] },
      { id: "t13", kind: "tree", species: "birch", position: [0.5, 6.5] },
    ],
    spawn: { position: [-10, 9], heading: 20 },
    skyColor: 0x86c1ee, // vivid blue horizon; the sky dome adds a deeper blue overhead
    fog: { near: 10, far: 70 },
  };
}
