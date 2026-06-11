import * as THREE from "three";
import type { Level } from "../level/schema";
import { buildWorld, type World } from "./world";
import { buildVoxelWorld } from "./voxel";
import { Player } from "./player";
import { RetroPipeline } from "./retro";
import { Automap } from "./automap";
import { createSky } from "./sky";
import { Clouds } from "./clouds";

export type RenderMode = "continuous" | "voxel";

/** Top-level engine: owns the renderer, scene, player and retro pass, and the loop. */
export class GardenApp {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly retro: RetroPipeline;
  readonly player: Player;
  private readonly automap: Automap;
  private readonly clouds = new Clouds();
  private readonly clock = new THREE.Clock();
  private readonly hint: HTMLElement;
  private readonly modeLabel: HTMLElement;
  private world: World;
  // Voxel (Minecraft-style) is the chosen aesthetic; Doom-style stays behind the M toggle.
  private mode: RenderMode = "voxel";

  constructor(
    container: HTMLElement,
    private readonly level: Level,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(level.skyColor ?? 0x9fb6d6);
    if (level.fog) {
      this.scene.fog = new THREE.Fog(level.skyColor ?? 0x9fb6d6, level.fog.near, level.fog.far);
    }

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 250);

    // Gradient blue sky behind everything; horizon matches the fog so distance blends in.
    this.scene.add(createSky(0x2b86d9, level.skyColor ?? 0x9fb6d6));
    this.scene.add(this.clouds.group);

    // Blue skylight from above (hemisphere) + a warm directional sun — a clear-day look.
    this.scene.add(new THREE.HemisphereLight(0x9ec6f2, 0x55663c, 1.05));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
    sun.position.set(8, 14, 5);
    this.scene.add(sun);

    this.world = buildVoxelWorld(level);
    this.scene.add(this.world.group);

    this.retro = new RetroPipeline(this.renderer);
    this.player = new Player(
      this.camera,
      this.renderer.domElement,
      level.bounds,
      this.world.heightfield,
      this.world.colliders,
    );
    this.player.spawnAt(level.spawn);

    const hud = buildHud(level.meta.name);
    container.appendChild(hud.root);
    this.hint = hud.hint;
    this.modeLabel = hud.modeLabel;

    this.automap = new Automap(level);
    container.appendChild(this.automap.canvas);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    this.onResize();
    this.renderer.setAnimationLoop(this.frame);
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.retro.setSize(w, h);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "KeyM") {
      this.setMode(this.mode === "continuous" ? "voxel" : "continuous");
    } else if (e.code === "Tab") {
      e.preventDefault();
      this.automap.toggle();
    }
  };

  /** Rebuild the world in a different render mode, keeping the player where they are. */
  setMode(mode: RenderMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.scene.remove(this.world.group);
    this.world.dispose();
    this.world = mode === "voxel" ? buildVoxelWorld(this.level) : buildWorld(this.level);
    this.scene.add(this.world.group);
    this.player.setWorld(this.level.bounds, this.world.heightfield, this.world.colliders);
    this.modeLabel.textContent = mode === "voxel" ? "minecraft" : "doom";
  }

  private frame = () => {
    this.tick(Math.min(0.1, this.clock.getDelta()));
  };

  private faceBillboards(): void {
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    for (const b of this.world.billboards) {
      b.rotation.y = Math.atan2(cx - b.position.x, cz - b.position.z);
    }
  }

  /** Advance and render one frame by an explicit dt. Also used for headless stepping. */
  tick(dt: number): void {
    this.player.update(dt);
    this.clouds.update(dt);
    this.faceBillboards();
    this.hint.style.opacity = this.player.isLocked ? "0" : "1";
    this.retro.render(this.scene, this.camera);
    if (this.automap.isVisible) {
      this.automap.update(this.camera.position.x, this.camera.position.z, this.player.yaw);
    }
  };
}

function buildHud(name: string): { root: HTMLElement; hint: HTMLElement; modeLabel: HTMLElement } {
  const root = document.createElement("div");
  root.style.cssText =
    "position:absolute;inset:0;pointer-events:none;font:13px ui-monospace,Menlo,monospace;color:#e7ecdf;text-shadow:1px 1px 0 #1a1d16;";

  const crosshair = document.createElement("div");
  crosshair.style.cssText =
    "position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px;background:#e7ecdf;opacity:.5;";
  root.appendChild(crosshair);

  const hint = document.createElement("div");
  hint.style.cssText =
    "position:absolute;left:50%;top:50%;transform:translate(-50%,40px);text-align:center;transition:opacity .3s;background:rgba(18,22,16,.55);padding:14px 18px;border:1px solid rgba(231,236,223,.25);";
  hint.innerHTML =
    `<div style="font-size:15px;margin-bottom:8px">${name}</div>` +
    "<div>click to enter &middot; <b>WASD</b> move &middot; <b>mouse</b> look &middot; <b>space</b> jump &middot; <b>shift</b> run</div>" +
    '<div style="margin-top:4px;opacity:.7"><b>M</b> doom / minecraft &middot; <b>Tab</b> plan &middot; <b>esc</b> release cursor</div>';
  root.appendChild(hint);

  const modeLabel = document.createElement("div");
  modeLabel.textContent = "minecraft";
  modeLabel.style.cssText = "position:absolute;left:12px;top:10px;opacity:.7;";
  root.appendChild(modeLabel);

  return { root, hint, modeLabel };
}
