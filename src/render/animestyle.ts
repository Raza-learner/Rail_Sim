import * as THREE from "three";
import { addClouds } from "./clouds";

  // 4-band greyscale ramp: bands shape the light, hue comes from the BRDF
  // shadow-tint patch in applyToon (the sakura-crossing approach — tinting in
  // the ramp would flatten the colour, tinting in BRDF keeps saturations).
export const gradientMap = (() => {
  const data = new Uint8Array([
    80, 80, 80, 255,
    142, 142, 142, 255,
    202, 202, 202, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

// Patch the toon BRDF (`lights_toon_pars_fragment`) so darker bands tilt
// toward a cool violet instead of the surface just going darker — the hue
// shift separating "anime cel" from "low-poly 3D". One shared uniform for
// every material; existing onBeforeCompile hooks (flora sway, paddy water)
// are composed with, not clobbered.
const TOON_CHUNK = THREE.ShaderChunk["lights_toon_pars_fragment"];
const TOON_LINE =
  "vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;";
const TOON_PATCH = `
	vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
	vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;`;
const shadowTint = { value: new THREE.Color(0x6c5f8c) };
let shadowTintPatch: string | null = null;
function tintShadow(mat: THREE.MeshToonMaterial): void {
  if (mat.userData.shadowTinted) return;
  mat.userData.shadowTinted = true;
  if (!TOON_CHUNK || !TOON_CHUNK.includes(TOON_LINE)) return; // three changed chunk — ramp still works unpatched
  shadowTintPatch ??=
    "uniform vec3 uShadowTint;\n" + TOON_CHUNK.replace(TOON_LINE, TOON_PATCH);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer);
    shader.uniforms.uShadowTint = shadowTint;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_toon_pars_fragment>",
      shadowTintPatch!,
    );
  };
}

// Replace lit materials with flat cel-shaded ones.
export function applyToon(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out = src.map((m) => {
      if (
        m instanceof THREE.MeshLambertMaterial ||
        m instanceof THREE.MeshPhongMaterial ||
        m instanceof THREE.MeshStandardMaterial
      ) {
        const cel = new THREE.MeshToonMaterial({
          color: m.color.clone(),
          map: m.map ?? null,
          gradientMap,
          transparent: m.transparent,
          opacity: m.opacity,
          vertexColors: m.vertexColors,
          side: m.side,
        });
        tintShadow(cel);
        return cel;
      }
      if (m instanceof THREE.MeshToonMaterial && !m.gradientMap) m.gradientMap = gradientMap;
      if (m instanceof THREE.MeshToonMaterial) tintShadow(m);
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? out : out[0];
  });
}

export function setOutlineResolution(w: number, h: number) {
  outlineMaterial.uniforms.res.value.set(w, h);
}

const outlineMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { thickness: { value: 1.6 }, res: { value: new THREE.Vector2(1920, 1080) } },
  vertexShader: `
    uniform float thickness;
    uniform vec2 res;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vec3 nV = normalize(mat3(modelViewMatrix) * normal);
      // constant-pixel offset in clip space: a world-space offset thins out
      // with distance, a w-scaled NDC offset stays the same on screen
      vec2 n2 = nV.xy;
      vec2 dir = normalize(n2 + vec2(1e-6)) * step(1e-8, dot(n2, n2));
      gl_Position.xy += dir * (2.0 * thickness / res.y) * gl_Position.w;
    }`,
  fragmentShader: `void main() { gl_FragColor = vec4(0.06, 0.06, 0.09, 1.0); }`,
});

// Inverted-hull outline for solid, non-instanced meshes.
export function addOutlines(root: THREE.Object3D) {
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    if (mesh.name === "terrain" || mesh.name === "sky" || mesh.name === "hill" || mesh.name === "facade" || mesh.userData.outline) return;
    if (mesh.userData.noOutline) return;
    if ((mesh.material as THREE.Material)?.transparent) return;
    targets.push(mesh);
  });
  for (const mesh of targets) {
    const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
    outline.userData.outline = true;
    mesh.add(outline);
  }
}

// horizon colour shared by the sky gradient, the scene background and the fog
// so distant ground melts into the backdrop with no seam
export const SKY_HORIZON = 0xe9f3f8;

export function addSky(scene: THREE.Scene) {
  const geo = new THREE.SphereGeometry(4000, 32, 20);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // deep azure zenith melting to a pale warm horizon
  const top = new THREE.Color(0x1e83dc);
  const mid = new THREE.Color(0x5fb0ec);
  const bottom = new THREE.Color(SKY_HORIZON);
  const col = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.pow(Math.max(pos.getY(i) / 4000, 0), 0.55);
    col.copy(bottom).lerp(mid, Math.min(1, t * 2));
    col.lerp(top, Math.max(0, t * 2 - 1));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = "sky";
  // draw before everything opaque: anything (terrain, backdrop) painted later
  // must win depth against the empty sky shell
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);
}

export function addSun(scene: THREE.Scene) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  // small soft core with a long gentle falloff so the disc reads as haze,
  // not a hard circle behind the clouds
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 63);
  g.addColorStop(0, "rgba(255,252,235,0.9)");
  g.addColorStop(0.28, "rgba(255,246,214,0.42)");
  g.addColorStop(0.65, "rgba(255,246,214,0.12)");
  g.addColorStop(1, "rgba(255,246,214,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }),
  );
  sun.position.set(1400, 1500, 2600);
  sun.scale.set(520, 520, 1);
  sun.name = "sun";
  scene.add(sun);
}

export function applyAnimeStyle(scene: THREE.Scene) {
  addSky(scene);
  addSun(scene);
  applyToon(scene);
  addOutlines(scene);
  addClouds(scene);
}
