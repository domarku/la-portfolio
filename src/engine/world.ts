import * as THREE from "three";
import type { Level, Surface, Wall } from "../level/schema";
import { Heightfield } from "./heightfield";
import {
  getGroundMaterial,
  getStructureMaterial,
  getTreeTexture,
  speciesHeight,
} from "./assets";

/** A wall segment as a fat line, for circle-vs-segment player collision. */
export interface WallCollider {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
}

export interface World {
  group: THREE.Group;
  heightfield: Heightfield;
  colliders: WallCollider[];
  /** Tree planes; the app rotates these to face the camera each frame. */
  billboards: THREE.Mesh[];
  dispose(): void;
}

/**
 * Build the continuous ("Doom-style") representation of a level: real terrain,
 * draped surfaces, extruded walls, billboard trees. The voxel mode (Phase 0 step 7)
 * will be a second builder consuming the same Level.
 */
export function buildWorld(level: Level): World {
  const group = new THREE.Group();
  const heightfield = new Heightfield(level.bounds, level.terrain);
  const colliders: WallCollider[] = [];
  const billboards: THREE.Mesh[] = [];

  // Terrain mesh, textured as lawn (the default ground in this domain). Non-lawn
  // surfaces drape on top of it; lawn surfaces are redundant and skipped.
  group.add(buildTerrainMesh(level));

  for (const surface of level.surfaces) {
    if (surface.material === "lawn") continue;
    const mesh = buildSurfaceMesh(surface, heightfield);
    if (mesh) group.add(mesh);
  }

  for (const wall of level.walls) {
    const { mesh, segments } = buildWallMesh(wall, heightfield);
    if (mesh) group.add(mesh);
    colliders.push(...segments);
  }

  for (const prop of level.props) {
    if (prop.kind !== "tree" && prop.kind !== "shrub") continue;
    const mesh = buildTreeBillboard(prop.species, prop.position, prop.height, heightfield);
    group.add(mesh);
    billboards.push(mesh);
  }

  return {
    group,
    heightfield,
    colliders,
    billboards,
    dispose() {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      group.clear();
    },
  };
}

function buildTerrainMesh(level: Level): THREE.Mesh {
  const { bounds, terrain } = level;
  const { cols, rows } = terrain;
  const dx = (bounds.maxX - bounds.minX) / (cols - 1);
  const dz = (bounds.maxZ - bounds.minZ) / (rows - 1);
  const lawn = getGroundMaterial("lawn");

  const positions: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r < rows; r++) {
    const z = bounds.minZ + r * dz;
    for (let c = 0; c < cols; c++) {
      const x = bounds.minX + c * dx;
      positions.push(x, terrain.heights[r * cols + c], z);
      uvs.push(x / lawn.tileMeters, z / lawn.tileMeters);
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, lawn.material);
}

function buildSurfaceMesh(surface: Surface, hf: Heightfield): THREE.Mesh | null {
  if (surface.polygon.length < 3) return null;
  const gm = getGroundMaterial(surface.material);
  const contour = surface.polygon.map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  if (faces.length === 0) return null;

  const positions: number[] = [];
  const uvs: number[] = [];
  for (const [x, z] of surface.polygon) {
    const y = gm.isWater ? surface.level ?? 0 : hf.sample(x, z) + gm.lift;
    positions.push(x, y, z);
    uvs.push(x / gm.tileMeters, z / gm.tileMeters);
  }
  // triangulateShape winds faces so that, laid out in the XZ plane, their normals
  // point down. Flip each face so the draped surface faces up like the terrain.
  const indices: number[] = [];
  for (const f of faces) indices.push(f[0], f[2], f[1]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, gm.material);
  mesh.name = surface.id;
  mesh.renderOrder = gm.isWater ? 2 : 1;
  return mesh;
}

export function buildWallMesh(
  wall: Wall,
  hf: Heightfield,
): { mesh: THREE.Mesh | null; segments: WallCollider[] } {
  const pts = wall.path;
  const segments: WallCollider[] = [];
  if (pts.length < 2) return { mesh: null, segments };

  const half = wall.thickness / 2;
  const sm = getStructureMaterial(wall.kind);

  // Per-vertex left/right offsets using the averaged segment normal (gentle paths
  // only, so no miter-length correction needed).
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    left.push(new THREE.Vector2(pts[i][0] + nx * half, pts[i][1] + nz * half));
    right.push(new THREE.Vector2(pts[i][0] - nx * half, pts[i][1] - nz * half));
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const baseY = pts.map(([x, z]) => hf.sample(x, z));
  const topY = baseY.map((b) => b + wall.height);
  let run = 0;

  const tri = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    uv0: [number, number],
    uv1: [number, number],
    uv2: [number, number],
  ) => {
    positions.push(...p0, ...p1, ...p2);
    uvs.push(...uv0, ...uv1, ...uv2);
  };
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    u0: number,
    u1: number,
    v0: number,
    v1: number,
  ) => {
    tri(a, b, c, [u0, v0], [u1, v0], [u1, v1]);
    tri(a, c, d, [u0, v0], [u1, v1], [u0, v1]);
  };

  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const u0 = run / sm.tileMeters;
    const u1 = (run + segLen) / sm.tileMeters;
    run += segLen;
    const v0 = 0;
    const v1 = wall.height / sm.tileMeters;

    const L0 = left[i];
    const L1 = left[i + 1];
    const R0 = right[i];
    const R1 = right[i + 1];

    // Left face.
    quad(
      [L0.x, baseY[i], L0.y],
      [L1.x, baseY[i + 1], L1.y],
      [L1.x, topY[i + 1], L1.y],
      [L0.x, topY[i], L0.y],
      u0, u1, v0, v1,
    );
    // Right face.
    quad(
      [R1.x, baseY[i + 1], R1.y],
      [R0.x, baseY[i], R0.y],
      [R0.x, topY[i], R0.y],
      [R1.x, topY[i + 1], R1.y],
      u0, u1, v0, v1,
    );
    // Top face.
    quad(
      [L0.x, topY[i], L0.y],
      [R0.x, topY[i], R0.y],
      [R1.x, topY[i + 1], R1.y],
      [L1.x, topY[i + 1], L1.y],
      u0, u1, 0, wall.thickness / sm.tileMeters,
    );

    segments.push({
      ax: pts[i][0],
      az: pts[i][1],
      bx: pts[i + 1][0],
      bz: pts[i + 1][1],
      half,
    });
  }

  // End caps.
  const cap = (i: number, l: THREE.Vector2, r: THREE.Vector2) => {
    quad(
      [l.x, baseY[i], l.y],
      [r.x, baseY[i], r.y],
      [r.x, topY[i], r.y],
      [l.x, topY[i], l.y],
      0, wall.thickness / sm.tileMeters, 0, wall.height / sm.tileMeters,
    );
  };
  cap(0, left[0], right[0]);
  cap(pts.length - 1, right[pts.length - 1], left[pts.length - 1]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return { mesh: new THREE.Mesh(geo, sm.material), segments };
}

const treeMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

export function treeMaterial(species: string): THREE.MeshBasicMaterial {
  const cached = treeMaterialCache.get(species);
  if (cached) return cached;
  const mat = new THREE.MeshBasicMaterial({
    map: getTreeTexture(species),
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  treeMaterialCache.set(species, mat);
  return mat;
}

function buildTreeBillboard(
  species: string | undefined,
  position: [number, number],
  height: number | undefined,
  hf: Heightfield,
): THREE.Mesh {
  const h = height ?? speciesHeight(species);
  const w = h * 0.7;
  const mat = treeMaterial(species ?? "oak");
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, mat);
  const [x, z] = position;
  mesh.position.set(x, hf.sample(x, z) + h / 2, z);
  return mesh;
}
