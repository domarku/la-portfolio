import * as THREE from "three";

// The retro look. The scene is rendered into a small offscreen buffer (~240p), then
// blown up to the window with nearest-neighbour sampling so every texel is a hard,
// chunky pixel. A final shader posterises the colour to a handful of levels per
// channel with a static ordered-ish dither — the banding is the point. Distance fog
// (set on the scene, not here) does the "darkness/haze with distance" Doom trick.

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform float uLevels;
  uniform float uDither;
  uniform vec2 uLowRes;

  // Stable screen-space dither mask — fixed per low-res cell, no time term, so it
  // reads as a dither pattern rather than sparkle.
  float mask(vec2 p) {
    return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    // Linear buffer -> display space before quantising, so bands sit where the eye sees them.
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
    float d = uDither > 0.5 ? (mask(vUv * uLowRes) - 0.5) / uLevels : 0.0;
    c = floor(c * uLevels + d + 0.5) / uLevels;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export class RetroPipeline {
  /** Vertical resolution of the offscreen buffer. Lower = chunkier. */
  pixelHeight = 240;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly fsScene = new THREE.Scene();
  private readonly fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uLevels: { value: 6 },
        uDither: { value: 1 },
        uLowRes: { value: new THREE.Vector2(2, 2) },
      },
    });
    this.fsScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  set levels(n: number) {
    this.material.uniforms.uLevels.value = n;
  }
  set dither(on: boolean) {
    this.material.uniforms.uDither.value = on ? 1 : 0;
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    const lowH = this.pixelHeight;
    const lowW = Math.max(2, Math.round(lowH * (width / height)));
    this.target.setSize(lowW, lowH);
    this.material.uniforms.uLowRes.value.set(lowW, lowH);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.fsScene, this.fsCamera);
  }
}
