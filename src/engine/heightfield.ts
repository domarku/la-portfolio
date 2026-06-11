import type { Bounds, Terrain } from "../level/schema";

/**
 * Bilinear sampler over a terrain grid. The rendered terrain mesh and the player's
 * walk-on height both read through this, so the ground you see is the ground you
 * stand on. Sampling outside the bounds clamps to the edge.
 */
export class Heightfield {
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  readonly dx: number;
  readonly dz: number;
  private readonly heights: number[];

  constructor(bounds: Bounds, terrain: Terrain) {
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.cols = terrain.cols;
    this.rows = terrain.rows;
    this.dx = (bounds.maxX - bounds.minX) / (terrain.cols - 1);
    this.dz = (bounds.maxZ - bounds.minZ) / (terrain.rows - 1);
    this.heights = terrain.heights;
  }

  private at(col: number, row: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, col));
    const r = Math.min(this.rows - 1, Math.max(0, row));
    return this.heights[r * this.cols + c];
  }

  /** Ground elevation in metres at world (x, z). */
  sample(x: number, z: number): number {
    const gx = (x - this.minX) / this.dx;
    const gz = (z - this.minZ) / this.dz;
    const c0 = Math.floor(gx);
    const r0 = Math.floor(gz);
    const fx = gx - c0;
    const fz = gz - r0;
    const h00 = this.at(c0, r0);
    const h10 = this.at(c0 + 1, r0);
    const h01 = this.at(c0, r0 + 1);
    const h11 = this.at(c0 + 1, r0 + 1);
    const top = h00 * (1 - fx) + h10 * fx;
    const bot = h01 * (1 - fx) + h11 * fx;
    return top * (1 - fz) + bot * fz;
  }
}
