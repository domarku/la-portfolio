import * as THREE from "three";

// Minecraft-style voxel clouds: chunky white blocks clumped into flat-ish puffs,
// floating at altitude and drifting slowly across the sky. Each puff wraps around
// individually when it reaches the edge of the field, so the drift never visibly
// resets. Unlit by fog (they stay crisp white) but lit by the scene sun, so the
// posterise pass snaps their faces into bright tops and slightly shaded sides.

const DRIFT = 0.7; // m/s — a lazy Minecraft cloud drift
const FIELD = 150; // clouds scatter over ±FIELD metres horizontally

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export class Clouds {
  readonly group = new THREE.Group();
  private readonly puffs: THREE.Group[] = [];

  constructor() {
    // Mostly self-lit so undersides stay bright white (you view clouds from below);
    // the sun's diffuse term still lifts the tops a touch for subtle blocky shading.
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      emissive: 0xe2ebf5,
      emissiveIntensity: 0.85,
      fog: false,
    });
    const r = rng(1337);
    const COUNT = 16;
    for (let i = 0; i < COUNT; i++) {
      const puff = new THREE.Group();
      puff.position.set(
        -FIELD + r() * (FIELD * 2),
        40 + r() * 14,
        -FIELD + r() * (FIELD * 2),
      );
      const blocks = 4 + Math.floor(r() * 4);
      for (let b = 0; b < blocks; b++) {
        const w = 5 + r() * 8;
        const h = 2.5 + r() * 2;
        const d = 5 + r() * 8;
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        box.position.set((r() - 0.5) * 11, (r() - 0.5) * 2.5, (r() - 0.5) * 11);
        puff.add(box);
      }
      this.group.add(puff);
      this.puffs.push(puff);
    }
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      p.position.x += DRIFT * dt;
      if (p.position.x > FIELD) p.position.x -= FIELD * 2;
    }
  }
}
