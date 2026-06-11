import * as THREE from "three";
import type { Bounds, Spawn } from "../level/schema";
import type { Heightfield } from "./heightfield";
import type { WallCollider } from "./world";

const DEG2RAD = Math.PI / 180;
const EYE_HEIGHT = 1.6; // metres — true standing eye height; the whole point of real scale
const WALK_SPEED = 3.2; // m/s
const RUN_SPEED = 5.8;
const PLAYER_RADIUS = 0.35;
const LOOK_SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.08;
const JUMP_SPEED = 6.0; // m/s initial — a ~0.9 m hop
const GRAVITY = 20; // m/s²

/**
 * First-person walker: pointer-lock mouse look, WASD movement, true eye height,
 * terrain following with implicit auto-step (the ground is C0-continuous, so walking
 * up a slope or a blended terrace edge just works), a space-bar jump with real gravity,
 * subtle head-bob, and circle-vs-segment collision against walls and hedges.
 */
export class Player {
  yaw = 0;
  pitch = 0;
  private readonly pos = new THREE.Vector2(); // (x, z) on the ground plane
  private camY = EYE_HEIGHT;
  private feetY = 0; // ground-contact height of the feet, in metres
  private velY = 0; // vertical velocity while airborne
  private grounded = true;
  private jumpRequested = false;
  private bobPhase = 0;
  private readonly keys = new Set<string>();
  private locked = false;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    private bounds: Bounds,
    private hf: Heightfield,
    private colliders: WallCollider[],
  ) {
    dom.addEventListener("click", this.requestLock);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** Swap in new world data (used when toggling render modes) without re-spawning. */
  setWorld(bounds: Bounds, hf: Heightfield, colliders: WallCollider[]): void {
    this.bounds = bounds;
    this.hf = hf;
    this.colliders = colliders;
  }

  spawnAt(spawn: Spawn): void {
    this.pos.set(spawn.position[0], spawn.position[1]);
    this.yaw = spawn.heading * DEG2RAD;
    this.pitch = 0;
    this.feetY = this.hf.sample(this.pos.x, this.pos.y);
    this.velY = 0;
    this.grounded = true;
    this.camY = this.feetY + EYE_HEIGHT;
    this.applyToCamera();
  }

  private requestLock = () => {
    if (!this.locked) this.dom.requestPointerLock();
  };

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.dom;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.yaw -= e.movementX * LOOK_SENSITIVITY;
    this.pitch -= e.movementY * LOOK_SENSITIVITY;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === "Space") {
      e.preventDefault();
      if (!e.repeat) this.jumpRequested = true; // one jump per physical press
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private moveAxis(): THREE.Vector2 {
    // Match the camera basis from rotation.set(pitch, yaw, 0, "YXZ"):
    //   forward (−Z) = (−sin yaw, −cos yaw);  right (+X) = (cos yaw, −sin yaw), in (x, z).
    const fwd = (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const strafe = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dir = new THREE.Vector2(
      -sin * fwd + cos * strafe,
      -cos * fwd - sin * strafe,
    );
    if (dir.lengthSq() > 0) dir.normalize();
    return dir;
  }

  private resolveCollisions(): void {
    // Push the player circle out of each wall segment it overlaps. A couple of passes
    // settle corners where two segments meet.
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.colliders) {
        const abx = c.bx - c.ax;
        const abz = c.bz - c.az;
        const lenSq = abx * abx + abz * abz || 1;
        let t = ((this.pos.x - c.ax) * abx + (this.pos.y - c.az) * abz) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = c.ax + abx * t;
        const cz = c.az + abz * t;
        let dx = this.pos.x - cx;
        let dz = this.pos.y - cz;
        let dist = Math.hypot(dx, dz);
        const minDist = c.half + PLAYER_RADIUS;
        if (dist < minDist) {
          if (dist < 1e-4) {
            dx = 1;
            dz = 0;
            dist = 1;
          }
          this.pos.x = cx + (dx / dist) * minDist;
          this.pos.y = cz + (dz / dist) * minDist;
        }
      }
    }
  }

  update(dt: number): void {
    const dir = this.moveAxis();
    const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")
      ? RUN_SPEED
      : WALK_SPEED;
    const moving = dir.lengthSq() > 0;

    this.pos.x += dir.x * speed * dt;
    this.pos.y += dir.y * speed * dt;

    const m = PLAYER_RADIUS;
    this.pos.x = Math.max(this.bounds.minX + m, Math.min(this.bounds.maxX - m, this.pos.x));
    this.pos.y = Math.max(this.bounds.minZ + m, Math.min(this.bounds.maxZ - m, this.pos.y));
    this.resolveCollisions();

    // Vertical: follow the ground when grounded, ballistic arc when airborne.
    const groundY = this.hf.sample(this.pos.x, this.pos.y);
    if (this.grounded) {
      // Light smoothing so small terrain steps read as a stride rather than a snap.
      this.feetY += (groundY - this.feetY) * Math.min(1, dt * 14);
      if (this.jumpRequested) {
        this.feetY = groundY;
        this.velY = JUMP_SPEED;
        this.grounded = false;
      }
    } else {
      this.velY -= GRAVITY * dt;
      this.feetY += this.velY * dt;
      if (this.feetY <= groundY) {
        this.feetY = groundY;
        this.velY = 0;
        this.grounded = true;
      }
    }
    this.jumpRequested = false;

    // Head-bob only while walking on the ground.
    const bobbing = moving && this.grounded;
    if (bobbing) this.bobPhase += dt * speed * 1.9;
    const bob = bobbing ? Math.sin(this.bobPhase * 2) * 0.045 : 0;

    this.camY = this.feetY + EYE_HEIGHT + bob;
    this.applyToCamera();
  }

  private applyToCamera(): void {
    this.camera.position.set(this.pos.x, this.camY, this.pos.y);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  dispose(): void {
    this.dom.removeEventListener("click", this.requestLock);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}
