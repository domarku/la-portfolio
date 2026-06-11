import * as THREE from "three";
import type { SurfaceMaterial, WallKind } from "../level/schema";

// Procedural placeholder art. Everything here is generated on a <canvas> at load —
// no files, no licensing. These stand in for CC0 pixel textures/sprites (Kenney,
// OpenGameArt, itch.io) that get dropped in once an aesthetic is chosen. They are
// deliberately low-res and palette-limited so the retro look reads from the start.

/** Deterministic pseudo-random so generated textures are stable across reloads. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A flat base colour speckled with a few palette-near shades — grass, gravel, soil. */
function speckle(
  size: number,
  base: string,
  speckles: string[],
  density: number,
  seed: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rng = makeRng(seed);
  const count = Math.floor(size * size * density);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = speckles[Math.floor(rng() * speckles.length)];
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

/** A grid of slabs/planks with grout lines — paving, deck. */
function tiled(
  size: number,
  base: string,
  grout: string,
  cells: number,
  jitter: string[],
  seed: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const step = size / cells;
  const rng = makeRng(seed);
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      ctx.fillStyle = rng() < 0.35 ? jitter[Math.floor(rng() * jitter.length)] : base;
      ctx.fillRect(gx * step, gy * step, step, step);
    }
  }
  ctx.fillStyle = grout;
  for (let i = 0; i <= cells; i++) {
    ctx.fillRect(Math.round(i * step), 0, 1, size);
    ctx.fillRect(0, Math.round(i * step), size, 1);
  }
  return c;
}

export interface GroundMaterial {
  material: THREE.Material;
  /** One texture tile spans this many metres of ground. */
  tileMeters: number;
  /** Small vertical offset to stop coplanar surfaces z-fighting. */
  lift: number;
  /** Water renders as a flat plane at its `level`, not draped on terrain. */
  isWater: boolean;
}

const cache = new Map<SurfaceMaterial, GroundMaterial>();

function lambert(canvas: HTMLCanvasElement, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ map: pixelTexture(canvas), ...opts });
}

export function getGroundMaterial(material: SurfaceMaterial): GroundMaterial {
  const cached = cache.get(material);
  if (cached) return cached;

  let result: GroundMaterial;
  switch (material) {
    case "lawn":
      result = {
        material: lambert(speckle(32, "#4d7a31", ["#5a8a3a", "#406a2a", "#6b9647"], 0.25, 11)),
        tileMeters: 2.5,
        lift: 0.01,
        isWater: false,
      };
      break;
    case "meadow":
      result = {
        material: lambert(speckle(32, "#6b8a3a", ["#7d9b45", "#586f2c", "#9aa84a"], 0.3, 23)),
        tileMeters: 2.5,
        lift: 0.012,
        isWater: false,
      };
      break;
    case "gravel":
      result = {
        material: lambert(speckle(32, "#b3a589", ["#c7bba0", "#9c8f73", "#857a61"], 0.4, 31)),
        tileMeters: 1.4,
        lift: 0.03,
        isWater: false,
      };
      break;
    case "paving":
      result = {
        material: lambert(tiled(48, "#9a948c", "#6f6a63", 4, ["#a8a299", "#8c867e"], 41)),
        tileMeters: 1.5,
        lift: 0.035,
        isWater: false,
      };
      break;
    case "deck":
      result = {
        material: lambert(tiled(48, "#8a6a40", "#5e4a2c", 6, ["#9a784c", "#7a5c36"], 51)),
        tileMeters: 1.5,
        lift: 0.05,
        isWater: false,
      };
      break;
    case "soil":
      result = {
        material: lambert(speckle(32, "#6b4f33", ["#7a5c3c", "#5a422a", "#4a3622"], 0.3, 61)),
        tileMeters: 2.0,
        lift: 0.015,
        isWater: false,
      };
      break;
    case "water":
      result = {
        material: lambert(speckle(32, "#2f6f8f", ["#3a82a3", "#27607c", "#4a93b0"], 0.2, 71), {
          transparent: true,
          opacity: 0.82,
        }),
        tileMeters: 3.0,
        lift: 0,
        isWater: true,
      };
      break;
  }
  cache.set(material, result);
  return result;
}

// --- Wall / hedge materials -------------------------------------------------

export interface StructureMaterial {
  material: THREE.Material;
  tileMeters: number;
}

const structureCache = new Map<WallKind, StructureMaterial>();

export function getStructureMaterial(kind: WallKind): StructureMaterial {
  const cached = structureCache.get(kind);
  if (cached) return cached;
  const result: StructureMaterial =
    kind === "hedge"
      ? {
          material: lambert(
            speckle(32, "#34552a", ["#3f6b2a", "#2a4720", "#4d7d33"], 0.5, 81),
            { side: THREE.DoubleSide },
          ),
          tileMeters: 1.0,
        }
      : {
          material: lambert(tiled(48, "#8d8880", "#6a655e", 5, ["#9a958d", "#7e7971"], 91), {
            side: THREE.DoubleSide,
          }),
          tileMeters: 1.0,
        };
  structureCache.set(kind, result);
  return result;
}

// --- Tree / plant sprites ---------------------------------------------------

interface SpeciesLook {
  trunk: string;
  canopy: string[];
  shape: "round" | "cone" | "oval";
  defaultHeight: number;
}

const SPECIES: Record<string, SpeciesLook> = {
  oak: { trunk: "#5b4326", canopy: ["#3f6b2a", "#4d7d33", "#345a22"], shape: "round", defaultHeight: 7 },
  pine: { trunk: "#4a3520", canopy: ["#2c5230", "#365f38", "#244526"], shape: "cone", defaultHeight: 9 },
  birch: { trunk: "#d8d2c0", canopy: ["#7fa84a", "#8eb857", "#6e9540"], shape: "oval", defaultHeight: 6 },
};

const DEFAULT_LOOK: SpeciesLook = SPECIES.oak;

const spriteCache = new Map<string, THREE.Texture>();

/** Draw a chunky tree sprite: trunk + a dithered canopy on transparent ground. */
export function getTreeTexture(species: string): THREE.Texture {
  const key = species in SPECIES ? species : "oak";
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const look = SPECIES[key] ?? DEFAULT_LOOK;
  const W = 48;
  const H = 64;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const rng = makeRng(key.length * 131 + 7);

  // Trunk.
  const trunkW = 6;
  ctx.fillStyle = look.trunk;
  ctx.fillRect((W - trunkW) / 2, H * 0.55, trunkW, H * 0.45);
  if (key === "birch") {
    ctx.fillStyle = "#3a3a30";
    for (let i = 0; i < 5; i++) {
      ctx.fillRect((W - trunkW) / 2, H * 0.6 + i * 5, trunkW, 1);
    }
  }

  // Canopy: scatter palette blocks inside a shape mask.
  const cx = W / 2;
  const cyTop = H * 0.06;
  const cyBot = H * 0.62;
  const inShape = (x: number, y: number): boolean => {
    const t = (y - cyTop) / (cyBot - cyTop); // 0 at top, 1 at bottom of canopy
    if (t < 0 || t > 1) return false;
    let halfW: number;
    if (look.shape === "cone") halfW = (W * 0.46) * t;
    else if (look.shape === "oval") halfW = (W * 0.32) * Math.sin(Math.PI * (0.15 + 0.85 * t));
    else halfW = (W * 0.46) * Math.sin(Math.PI * (0.1 + 0.9 * t));
    return Math.abs(x - cx) < halfW;
  };
  const block = 3;
  for (let y = 0; y < cyBot; y += block) {
    for (let x = 0; x < W; x += block) {
      if (inShape(x + block / 2, y + block / 2)) {
        ctx.fillStyle = look.canopy[Math.floor(rng() * look.canopy.length)];
        ctx.fillRect(x, y, block, block);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, tex);
  return tex;
}

export function speciesHeight(species: string | undefined): number {
  if (species && species in SPECIES) return SPECIES[species].defaultHeight;
  return DEFAULT_LOOK.defaultHeight;
}
