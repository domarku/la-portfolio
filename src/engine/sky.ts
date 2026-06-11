import * as THREE from "three";

// A simple gradient sky dome — deeper blue at the zenith fading to a pale blue at the
// horizon. It sits behind everything (no depth, no fog) and the horizon colour matches
// the scene fog so distant terrain melts into the sky. The retro posterise pass bands
// the gradient slightly; the dither smooths it into a believable daytime sky.

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  void main() {
    float t = clamp(vDir.y, 0.0, 1.0);
    vec3 c = mix(uHorizon, uTop, pow(t, 0.6));
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function createSky(topColor: number, horizonColor: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(topColor) },
      uHorizon: { value: new THREE.Color(horizonColor) },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 16, 12), material);
  sky.renderOrder = -1; // draw first, as the backdrop
  sky.frustumCulled = false;
  return sky;
}
