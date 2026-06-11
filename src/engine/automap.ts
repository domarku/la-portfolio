import type { Level, SurfaceMaterial } from "../level/schema";

// The Tab-key automap — Doom's iconic map screen, reimagined as the project's plan
// drawing with the visitor's position on it. Here it's drawn from the level data, but
// the real payoff is swapping this for the architect's actual plan image: the moment a
// visitor realises they're walking inside the document.

const PLAN_COLORS: Record<SurfaceMaterial, string> = {
  lawn: "#6f8f4a",
  meadow: "#86a154",
  gravel: "#cdbf9e",
  paving: "#b3ada3",
  water: "#5f93b0",
  deck: "#9a7a4c",
  soil: "#7a5c3c",
};

export class Automap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scale: number;
  private readonly originX: number;
  private readonly originY: number;
  private visible = false;

  constructor(private readonly level: Level) {
    const { minX, minZ, maxX, maxZ } = level.bounds;
    const worldW = maxX - minX;
    const worldD = maxZ - minZ;
    const margin = 40;
    const inner = 560;
    this.scale = inner / Math.max(worldW, worldD);
    const w = worldW * this.scale + margin * 2;
    const h = worldD * this.scale + margin * 2;

    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.cssText =
      "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
      "max-width:88vw;max-height:84vh;image-rendering:pixelated;display:none;" +
      "border:2px solid #2a2d22;box-shadow:0 0 0 4px rgba(20,24,16,.6);background:#1d2017;";
    this.ctx = this.canvas.getContext("2d")!;
    this.originX = margin - minX * this.scale;
    this.originY = margin - minZ * this.scale;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.canvas.style.display = this.visible ? "block" : "none";
  }

  private sx(x: number): number {
    return this.originX + x * this.scale;
  }
  private sy(z: number): number {
    return this.originY + z * this.scale;
  }

  /** Redraw the plan plus the player marker. Called each frame while visible. */
  update(px: number, pz: number, yaw: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#e9e4d3";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (const s of this.level.surfaces) {
      if (s.polygon.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(this.sx(s.polygon[0][0]), this.sy(s.polygon[0][1]));
      for (let i = 1; i < s.polygon.length; i++) {
        ctx.lineTo(this.sx(s.polygon[i][0]), this.sy(s.polygon[i][1]));
      }
      ctx.closePath();
      ctx.fillStyle = PLAN_COLORS[s.material];
      ctx.fill();
    }

    for (const wall of this.level.walls) {
      ctx.beginPath();
      ctx.moveTo(this.sx(wall.path[0][0]), this.sy(wall.path[0][1]));
      for (let i = 1; i < wall.path.length; i++) {
        ctx.lineTo(this.sx(wall.path[i][0]), this.sy(wall.path[i][1]));
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, wall.thickness * this.scale);
      ctx.strokeStyle = wall.kind === "hedge" ? "#3f6b2a" : "#6a655e";
      ctx.stroke();
    }

    for (const prop of this.level.props) {
      if (prop.kind !== "tree" && prop.kind !== "shrub") continue;
      const x = this.sx(prop.position[0]);
      const y = this.sy(prop.position[1]);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#4d7d33";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#2a4720";
      ctx.stroke();
    }

    // Player marker: a triangle pointing along the heading (north = up).
    const fx = Math.sin(yaw);
    const fy = -Math.cos(yaw);
    const cx = this.sx(px);
    const cy = this.sy(pz);
    const size = 11;
    ctx.beginPath();
    ctx.moveTo(cx + fx * size, cy + fy * size);
    ctx.lineTo(cx - fy * size * 0.6 - fx * size * 0.5, cy + fx * size * 0.6 - fy * size * 0.5);
    ctx.lineTo(cx + fy * size * 0.6 - fx * size * 0.5, cy - fx * size * 0.6 - fy * size * 0.5);
    ctx.closePath();
    ctx.fillStyle = "#d83b3b";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#f4e9c9";
    ctx.stroke();

    // North indicator + title.
    ctx.fillStyle = "#2a2d22";
    ctx.font = "16px ui-monospace, Menlo, monospace";
    ctx.fillText(this.level.meta.name, 12, 24);
    ctx.fillText("N↑", this.canvas.width - 34, 24);
  }
}
