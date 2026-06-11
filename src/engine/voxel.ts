import * as THREE from "three";
import type { Level, Surface, SurfaceMaterial, Vec2 } from "../level/schema";
import { Heightfield } from "./heightfield";
import { getGroundMaterial, speciesHeight } from "./assets";
import { buildWallMesh, treeMaterial, type World, type WallCollider } from "./world";

// The voxel ("Minecraft-style") representation of a level. The same Level data is
// rasterised onto a block grid: terrain snaps to block heights, curved beds get
// staircase edges, the ground material is sampled per cell. This is exactly the
// transformation the landscape architect needs to *see* before choosing an aesthetic —
// whether her curves voxelised read as charming or as sacrilege.
//
// The player walks the same smooth heightfield as the continuous mode, so navigation
// and collision are identical between the two — only the look changes.

const VOX = 0.5; // block size in metres

interface CellMaterial {
  material: SurfaceMaterial;
  /** Water surface height if this cell is water. */
  waterLevel?: number;
}

function pointInPolygon(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Last surface (top of the draw order) whose polygon contains the point wins. */
function materialAt(x: number, z: number, surfaces: Surface[]): CellMaterial {
  let result: CellMaterial = { material: "lawn" };
  for (const s of surfaces) {
    if (pointInPolygon(x, z, s.polygon)) {
      result = s.material === "water"
        ? { material: "water", waterLevel: s.level ?? 0 }
        : { material: s.material };
    }
  }
  return result;
}

const snap = (h: number) => Math.round(h / VOX) * VOX;

type Buffers = { pos: number[]; uv: number[] };

function topQuad(b: Buffers, cx: number, cz: number, y: number, tile: number): void {
  const h = VOX / 2;
  const a: [number, number, number] = [cx - h, y, cz - h];
  const c: [number, number, number] = [cx + h, y, cz + h];
  const d: [number, number, number] = [cx - h, y, cz + h];
  const e: [number, number, number] = [cx + h, y, cz - h];
  // (a, d, c) + (a, c, e) winds normals up.
  b.pos.push(...a, ...d, ...c, ...a, ...c, ...e);
  const u0 = (cx - h) / tile;
  const u1 = (cx + h) / tile;
  const v0 = (cz - h) / tile;
  const v1 = (cz + h) / tile;
  b.uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
}

/** A vertical face exposed between a cell top and a lower neighbour, on one side. */
function sideQuad(
  b: Buffers,
  cx: number,
  cz: number,
  yTop: number,
  yLow: number,
  dir: "px" | "nx" | "pz" | "nz",
  tile: number,
): void {
  const h = VOX / 2;
  let p: [number, number, number][];
  if (dir === "px") {
    p = [[cx + h, yLow, cz - h], [cx + h, yLow, cz + h], [cx + h, yTop, cz + h], [cx + h, yTop, cz - h]];
  } else if (dir === "nx") {
    p = [[cx - h, yLow, cz + h], [cx - h, yLow, cz - h], [cx - h, yTop, cz - h], [cx - h, yTop, cz + h]];
  } else if (dir === "pz") {
    p = [[cx + h, yLow, cz + h], [cx - h, yLow, cz + h], [cx - h, yTop, cz + h], [cx + h, yTop, cz + h]];
  } else {
    p = [[cx - h, yLow, cz - h], [cx + h, yLow, cz - h], [cx + h, yTop, cz - h], [cx - h, yTop, cz - h]];
  }
  b.pos.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
  const w0 = 0;
  const w1 = VOX / tile;
  const t0 = yLow / tile;
  const t1 = yTop / tile;
  b.uv.push(w0, t0, w1, t0, w1, t1, w0, t0, w1, t1, w0, t1);
}

const doubleSidedCache = new Map<SurfaceMaterial, THREE.Material>();

function voxelMaterial(material: SurfaceMaterial): THREE.Material {
  const cached = doubleSidedCache.get(material);
  if (cached) return cached;
  const mat = getGroundMaterial(material).material.clone();
  mat.side = THREE.DoubleSide;
  doubleSidedCache.set(material, mat);
  return mat;
}

export function buildVoxelWorld(level: Level): World {
  const group = new THREE.Group();
  const heightfield = new Heightfield(level.bounds, level.terrain);
  const colliders: WallCollider[] = [];

  const { minX, minZ, maxX, maxZ } = level.bounds;
  const nx = Math.ceil((maxX - minX) / VOX);
  const nz = Math.ceil((maxZ - minZ) / VOX);

  // First pass: snapped top height and material for every cell.
  const tops: number[] = new Array(nx * nz);
  const mats: CellMaterial[] = new Array(nx * nz);
  let minTop = Infinity;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = minX + (i + 0.5) * VOX;
      const cz = minZ + (j + 0.5) * VOX;
      const cm = materialAt(cx, cz, level.surfaces);
      const groundTop = snap(heightfield.sample(cx, cz));
      const top = cm.material === "water" ? snap(cm.waterLevel ?? 0) : groundTop;
      tops[j * nx + i] = top;
      mats[j * nx + i] = cm;
      if (top < minTop) minTop = top;
    }
  }
  const skirt = minTop - VOX;

  // Second pass: emit top + exposed side faces, grouped by material.
  const byMaterial = new Map<SurfaceMaterial, Buffers>();
  const bufFor = (m: SurfaceMaterial): Buffers => {
    let b = byMaterial.get(m);
    if (!b) {
      b = { pos: [], uv: [] };
      byMaterial.set(m, b);
    }
    return b;
  };

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = j * nx + i;
      const top = tops[idx];
      const cm = mats[idx];
      const cx = minX + (i + 0.5) * VOX;
      const cz = minZ + (j + 0.5) * VOX;
      const tile = getGroundMaterial(cm.material).tileMeters;
      const b = bufFor(cm.material);
      topQuad(b, cx, cz, top, tile);

      const neighbour = (ni: number, nj: number): number =>
        ni < 0 || nj < 0 || ni >= nx || nj >= nz ? skirt : tops[nj * nx + ni];
      const px = neighbour(i + 1, j);
      const nxN = neighbour(i - 1, j);
      const pz = neighbour(i, j + 1);
      const nzN = neighbour(i, j - 1);
      if (px < top) sideQuad(b, cx, cz, top, px, "px", tile);
      if (nxN < top) sideQuad(b, cx, cz, top, nxN, "nx", tile);
      if (pz < top) sideQuad(b, cx, cz, top, pz, "pz", tile);
      if (nzN < top) sideQuad(b, cx, cz, top, nzN, "nz", tile);
    }
  }

  for (const [material, b] of byMaterial) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, voxelMaterial(material));
    mesh.name = `voxel-${material}`;
    if (material === "water") mesh.renderOrder = 2;
    group.add(mesh);
  }

  // Walls/hedges reuse the continuous extrusion (thin, secondary to the ground read).
  for (const wall of level.walls) {
    const { mesh, segments } = buildWallMesh(wall, heightfield);
    if (mesh) group.add(mesh);
    colliders.push(...segments);
  }

  // Trees as static crossed quads — how Minecraft itself draws foliage.
  for (const prop of level.props) {
    if (prop.kind !== "tree" && prop.kind !== "shrub") continue;
    group.add(buildCrossedTree(prop.species, prop.position, prop.height, heightfield));
  }

  return {
    group,
    heightfield,
    colliders,
    billboards: [],
    dispose() {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      group.clear();
    },
  };
}

function buildCrossedTree(
  species: string | undefined,
  position: Vec2,
  height: number | undefined,
  hf: Heightfield,
): THREE.Group {
  const h = height ?? speciesHeight(species);
  const w = h * 0.7;
  const mat = treeMaterial(species ?? "oak");
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  b.rotation.y = Math.PI / 2;
  g.add(a, b);
  const [x, z] = position;
  g.position.set(x, hf.sample(x, z) + h / 2, z);
  return g;
}
