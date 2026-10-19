import * as THREE from "three";
import type { RailPath } from "../core/rail";
import { positionAt, tangentAt } from "../core/rail";
import { heightAt, distanceToTrack } from "./terrain";
import type { AABB } from "../core/player";

function rightOf(t: { x: number; z: number }) {
  const len = Math.hypot(t.x, t.z) || 1;
  return { x: t.z / len, z: -t.x / len };
}

function sAt(path: RailPath, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s <= path.totalLength; s += 10) {
    const d = Math.abs(positionAt(path, s).z - z);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

// Corridor landmarks: always loaded, never streamed. The continuous catenary
// wire and the bridge/crossing belong to the railway, not to a map tile.
export function buildStaticScenery(scene: THREE.Scene, path: RailPath) {
  buildHills(scene, path);
  buildBridge(scene, path);
  buildCrossing(scene, path);
  buildPoles(scene, path);
}

function buildBridge(scene: THREE.Scene, path: RailPath) {
  const s = sAt(path, 1400);
  const p = positionAt(path, s);
  const t = tangentAt(path, s);
  const yaw = Math.atan2(t.x, t.z);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.6, 70),
    new THREE.MeshToonMaterial({ color: 0x8a8f96 }),
  );
  deck.position.set(p.x, p.y - 0.35, p.z);
  deck.rotation.y = yaw;
  scene.add(deck);
  for (const off of [-2.9, 2.9]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 1.0, 70),
      new THREE.MeshToonMaterial({ color: 0x6b7076 }),
    );
    const r = rightOf(t);
    rail.position.set(p.x + r.x * off, p.y + 0.5, p.z + r.z * off);
    rail.rotation.y = yaw;
    scene.add(rail);
  }
}

function buildCrossing(scene: THREE.Scene, path: RailPath) {
  const s = sAt(path, 2350);
  const p = positionAt(path, s);
  const t = tangentAt(path, s);
  const yaw = Math.atan2(t.x, t.z);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 7),
    new THREE.MeshToonMaterial({ color: 0x555a60 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = yaw + Math.PI / 2;
  road.position.set(p.x, 0.06, p.z);
  scene.add(road);
  for (const off of [-1.0, 1.0]) {
    const r = rightOf(t);
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.08, 5),
      new THREE.MeshToonMaterial({ color: 0x3b3f45 }),
    );
    plank.position.set(p.x + r.x * off * 1.2, 0.09, p.z + r.z * off * 1.2);
    plank.rotation.y = yaw;
    scene.add(plank);
  }
}

function buildPoles(scene: THREE.Scene, path: RailPath) {
  const poleMat = new THREE.MeshToonMaterial({ color: 0x6b5641 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2f36 });
  const tops: THREE.Vector3[] = [];
  for (let s = 40; s < path.totalLength; s += 90) {
    const p = positionAt(path, s);
    const t = tangentAt(path, s);
    const r = rightOf(t);
    const x = p.x + r.x * 6.5;
    const z = p.z + r.z * 6.5;
    const gy = heightAt(path, x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 9, 6), poleMat);
    pole.position.set(x, gy + 4.5, z);
    scene.add(pole);
    const armYaw = Math.atan2(-r.z, r.x);
    for (const ay of [7.6, 8.6]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), poleMat);
      arm.position.set(x, gy + ay, z);
      arm.rotation.y = armYaw;
      scene.add(arm);
    }
    tops.push(new THREE.Vector3(x, gy + 8.6, z));
  }
  const pts: number[] = [];
  for (let i = 1; i < tops.length; i++) {
    pts.push(tops[i - 1].x, tops[i - 1].y, tops[i - 1].z, tops[i].x, tops[i].y, tops[i].z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(geo, wireMat));
}

function buildHills(scene: THREE.Scene, path: RailPath) {
  const near = new THREE.MeshToonMaterial({ color: 0x5f8a5a });
  const far = new THREE.MeshToonMaterial({ color: 0x7d97b4 });
  // keep hills and their skirts clear of the corridor, else a cone base
  // lands beside the track and grows over the sky
  const clear = (x: number, z: number, base: number) => distanceToTrack(path, x, z) < base + 350;
  let seed = 5150;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const rad = 4800 + rand() * 700;
    const h = 500 + rand() * 500;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad + 1800;
    if (clear(x, z, h * 2.2)) continue;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(h * 2.2, h, 6), far);
    hill.name = "hill";
    hill.position.set(x, h / 2 - 60, z);
    scene.add(hill);
  }
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + 0.2;
    const rad = 2100 + rand() * 400;
    const h = 260 + rand() * 260;
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad + 1800;
    if (clear(x, z, h * 2.6)) continue;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(h * 2.6, h, 6), near);
    hill.name = "hill";
    hill.position.set(x, h / 2 - 40, z);
    scene.add(hill);
  }
}

// Unit gable prism, ridge along local Z, footprint 1x1, height 1. Scaled per
// house so every roof reuses one geometry.
const GABLE = (() => {
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [
    ...a, ...b, ...c,
    ...a, ...c, ...d,
  ];
  const tri = (a: number[], b: number[], c: number[]) => [...a, ...b, ...c];
  const v = [
    ...tri([-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5]), // end +Z
    ...tri([-0.5, 0, -0.5], [0, 1, -0.5], [0.5, 0, -0.5]), // end -Z
    ...quad([0, 1, -0.5], [0, 1, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5]), // slope +X
    ...quad([0, 1, 0.5], [0, 1, -0.5], [-0.5, 0, -0.5], [-0.5, 0, 0.5]), // slope -X
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

// long face gives houses readable fronts, lazily built: module tests run in
// node without DOM.
let facadeMat: THREE.MeshBasicMaterial | null = null;
function facadeMaterial(): THREE.MeshBasicMaterial {
  if (!facadeMat) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#242b36";
    ctx.fillRect(52, 22, 24, 42); // door
    ctx.fillRect(10, 18, 26, 22); // window
    ctx.fillRect(92, 18, 26, 22); // window
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    facadeMat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 });
  }
  return facadeMat;
}

export function makeHouse(w: number, d: number, h: number, i: number, shop?: 1 | -1): THREE.Group {
  const house = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshToonMaterial({ color: [0xe8dfd0, 0xd9cbb8, 0xcfd6dd, 0xe3d3c4, 0xdcd2c0][i % 5] }),
  );
  body.position.y = h / 2;
  house.add(body);

  // gable roof, ridge along the longer axis, eaves overhanging
  const longX = w >= d;
  const roof = new THREE.Mesh(
    GABLE,
    new THREE.MeshToonMaterial({ color: [0x6a6f78, 0x8a4b3a, 0x4a5a6a, 0x555f6a][i % 4] }),
  );
  roof.rotation.y = longX ? Math.PI / 2 : 0;
  roof.scale.set(longX ? d * 1.15 : w * 1.15, 1.3, longX ? w * 1.15 : d * 1.15);
  roof.position.y = h - 0.02;
  house.add(roof);

  // facade planes on the two long faces
  const span = longX ? w : d;
  const rys = longX ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
  for (let k = 0; k < 2; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), facadeMaterial());
    f.name = "facade";
    f.rotation.y = rys[k];
    f.scale.set(span * 0.88, h * 0.85, 1);
    if (longX) f.position.set(0, h * 0.52, k ? -(d / 2 + 0.02) : d / 2 + 0.02);
    else f.position.set(k ? -(w / 2 + 0.02) : w / 2 + 0.02, h * 0.52, 0);
    house.add(f);
  }

  // street-side shop dressing: canopy slab + hanging sign, above head height
  if (shop) {
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.06, d * 0.7),
      new THREE.MeshToonMaterial({ color: i % 2 ? 0xd8524f : 0x396a94 }),
    );
    canopy.position.set(shop * (w / 2 + 0.28), 2.6, 0);
    house.add(canopy);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.9, d * 0.45),
      new THREE.MeshToonMaterial({ color: i % 2 ? 0xd8524f : 0x396a94 }),
    );
    sign.position.set(shop * (w / 2 + 0.1), 3.2, 0);
    house.add(sign);
  }

  return house;
}

// ---- streamed scatter -------------------------------------------------------
// The layout is planned once (deterministic) and bucketed by tile; tiles only
// build/dispose the meshes for their own share.

export type TreeItem = { x: number; y: number; z: number; s: number; yaw: number };
export type HouseItem = { x: number; y: number; z: number; w: number; d: number; h: number; i: number; yaw: number; shop?: 1 | -1 };
export type PaddyItem = { x: number; y: number; z: number; yaw: number };
export type Scatter = { trees: TreeItem[]; houses: HouseItem[]; paddies: PaddyItem[] };

const TOWN_S = 3500;
const TOWN_CLEAR_RADIUS = 140;

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function planScatter(path: RailPath): Scatter {
  const trees: TreeItem[] = [];
  const rand = lcg(12345);
  for (let i = 0; i < 1600 && trees.length < 600; i++) {
    const x = (rand() - 0.5) * 1600;
    const z = (rand() - 0.5) * 4800 + 1800;
    if (distanceToTrack(path, x, z) < 30) continue;
    if (Math.hypot(x, z - TOWN_S) < TOWN_CLEAR_RADIUS) continue; // keep town clear
    const y = heightAt(path, x, z);
    if (y < -0.5) continue; // not in the river
    const s = 1 + rand() * 1.4;
    trees.push({ x, y, z, s, yaw: s * 3 });
  }

  const houses: HouseItem[] = [];
  // town high street beside Yamabuki
  const townRand = lcg(777);
  {
    const p = positionAt(path, TOWN_S);
    const t = tangentAt(path, TOWN_S);
    const r = rightOf(t);
    const yaw = Math.atan2(t.x, t.z);
    for (let i = 0; i < 12; i++) {
      const along = (i - 6) * 26;
      const side = i % 2 === 0 ? 1 : -1;
      // keep house fronts clear of the platform corridor, else the follow
      // camera (9 m off the line) clips through a facade
      const lat = Math.max(28, 30 + side * 18);
      const x = p.x + t.x * along + r.x * lat;
      const z = p.z + t.z * along + r.z * lat;
      const w = 8 + townRand() * 5;
      const d = 8 + townRand() * 5;
      const h = 3.5 + townRand() * 4;
      // side=+1 sits on the +r bank and faces -x locally toward the street
      houses.push({ x, y: heightAt(path, x, z), z, w, d, h, i, yaw, shop: side === 1 ? -1 : 1 });
    }
  }
  // villages strung along the line
  const vilRand = lcg(31337);
  const clusters = [140, 900, 1700, 2650, 3300];
  for (let c = 0; c < clusters.length; c++) {
    const center = clusters[c];
    const count = 5 + Math.floor(vilRand() * 4);
    for (let i = 0; i < count; i++) {
      const s = Math.max(20, Math.min(path.totalLength - 20, center + (i - count / 2) * 22));
      const p = positionAt(path, s);
      const t = tangentAt(path, s);
      const r = rightOf(t);
      const side = (c + i) % 2 === 0 ? 1 : -1;
      const lat = (18 + vilRand() * 26) * side;
      const x = p.x + r.x * lat;
      const z = p.z + r.z * lat;
      const w = 6 + vilRand() * 5;
      const d = 6 + vilRand() * 5;
      const h = 3 + vilRand() * 3.5;
      houses.push({ x, y: heightAt(path, x, z), z, w, d, h, i: c + i, yaw: Math.atan2(t.x, t.z) + (vilRand() - 0.5) * 0.4 });
    }
  }

  const paddies: PaddyItem[] = [];
  for (let i = 0; i < 14; i++) {
    const s = 250 + i * 55;
    const p = positionAt(path, s);
    const t = tangentAt(path, s);
    const r = rightOf(t);
    const side = i % 2 === 0 ? -1 : 1;
    const off = 40 + (i % 3) * 12;
    const x = p.x + r.x * off * side;
    const z = p.z + r.z * off * side;
    paddies.push({ x, y: heightAt(path, x, z) + 0.06, z, yaw: Math.atan2(t.x, t.z) });
  }

  return { trees, houses, paddies };
}

export function bucketScatter(scatter: Scatter, tileSize: number): Map<string, Scatter> {
  const buckets = new Map<string, Scatter>();
  const box = (item: { x: number; z: number }): Scatter => {
    const key = `${Math.floor(item.x / tileSize)},${Math.floor(item.z / tileSize)}`;
    let b = buckets.get(key);
    if (!b) { b = { trees: [], houses: [], paddies: [] }; buckets.set(key, b); }
    return b;
  };
  for (const t of scatter.trees) box(t).trees.push(t);
  for (const h of scatter.houses) box(h).houses.push(h);
  for (const p of scatter.paddies) box(p).paddies.push(p);
  return buckets;
}

const UP = new THREE.Vector3(0, 1, 0);

export function buildTileScenery(scatter: Scatter): THREE.Group {
  const g = new THREE.Group();
  for (const hs of scatter.houses) {
    const house = makeHouse(hs.w, hs.d, hs.h, hs.i, hs.shop);
    house.position.set(hs.x, hs.y, hs.z);
    house.rotation.y = hs.yaw;
    g.add(house);
  }
  for (const p of scatter.paddies) {
    const pg = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 16),
      new THREE.MeshToonMaterial({ color: 0x7fae5a }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = p.yaw;
    pg.add(plane);
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 16),
      new THREE.MeshToonMaterial({ color: 0x5f7f45 }),
    );
    bank.position.set(-11 * Math.cos(p.yaw), 0, 11 * Math.sin(p.yaw));
    pg.add(bank);
    pg.position.set(p.x, p.y, p.z);
    g.add(pg);
  }
  if (scatter.trees.length > 0) {
    const trunk = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.18, 0.25, 2.4, 6),
      new THREE.MeshToonMaterial({ color: 0x5b4327 }),
      scatter.trees.length,
    );
    const foliage = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.8, 3.6, 7),
      new THREE.MeshToonMaterial({ color: 0x3f7a3a }),
      scatter.trees.length,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    scatter.trees.forEach((t, i) => {
      q.setFromAxisAngle(UP, t.yaw);
      m.compose(new THREE.Vector3(t.x, t.y + 1.2 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunk.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, t.y + 4.2 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      foliage.setMatrixAt(i, m);
    });
    trunk.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    g.add(trunk, foliage);
  }
  return g;
}

export function houseColliders(houses: HouseItem[]): AABB[] {
  return houses.map((hs) => {
    // axis-aligned bounds of the yaw-rotated footprint, shrunk so the player
    // can still squeeze past in a doorway gap
    const c = Math.abs(Math.cos(hs.yaw));
    const s = Math.abs(Math.sin(hs.yaw));
    const hx = Math.max(0, (c * hs.w + s * hs.d) / 2 - 0.35);
    const hz = Math.max(0, (s * hs.w + c * hs.d) / 2 - 0.35);
    return {
      min: { x: hs.x - hx, y: hs.y, z: hs.z - hz },
      max: { x: hs.x + hx, y: hs.y + hs.h, z: hs.z + hz },
    };
  });
}
