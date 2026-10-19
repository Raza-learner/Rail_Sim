import * as THREE from "three";
import { addClouds } from "./clouds";

// 4-band gradient ramp shared by every toon material. The shadow bands are
// blue-violet, not grey: anime shadows take color, which is what keeps large
// lit areas (terrain, roofs) from reading as washed-out grey.
export const gradientMap = (() => {
  const data = new Uint8Array([
    120, 132, 178, 255,
    178, 184, 212, 255,
    226, 229, 238, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

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
        return new THREE.MeshToonMaterial({
          color: m.color.clone(),
          map: m.map ?? null,
          gradientMap,
          transparent: m.transparent,
          opacity: m.opacity,
          vertexColors: m.vertexColors,
          side: m.side,
        });
      }
      if (m instanceof THREE.MeshToonMaterial && !m.gradientMap) m.gradientMap = gradientMap;
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? out : out[0];
  });
}

const outlineMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { thickness: { value: 0.055 } },
  vertexShader: `
    uniform float thickness;
    void main() {
      vec3 p = position + normal * thickness;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
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
    if ((mesh.material as THREE.Material)?.transparent) return;
    targets.push(mesh);
  });
  for (const mesh of targets) {
    const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
    outline.userData.outline = true;
    mesh.add(outline);
  }
}

export function addSky(scene: THREE.Scene) {
  const geo = new THREE.SphereGeometry(4000, 32, 20);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const top = new THREE.Color(0x1e6ed3);
  const mid = new THREE.Color(0x5aa0e8);
  const bottom = new THREE.Color(0xeff6fb);
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
  scene.add(sky);
}

export function addSun(scene: THREE.Scene) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 63);
  g.addColorStop(0, "rgba(255,252,235,1)");
  g.addColorStop(0.35, "rgba(255,246,210,0.8)");
  g.addColorStop(1, "rgba(255,246,210,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }),
  );
  sun.position.set(1400, 900, 2600);
  sun.scale.set(900, 900, 1);
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
