import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { RailPath } from "../core/rail";
import { positionAt, tangentAt } from "../core/rail";
import { heightAt, distanceToTrack, meshHeightAt } from "./terrain";
import type { AABB } from "../core/player";

// tunable: corridor-grass instance budget multiplier (1 = ~12k tufts)
export const GRASS_DENSITY = 1;

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
  buildProps(scene, path);
}

// Village props: a red post pillar and a バスのりば board beside each village
// cluster — small landmarks that make the stops feel inhabited. Built static:
// five clusters × two props, cheaper than plumbing new scatter buckets.
let busMat: THREE.MeshBasicMaterial | null = null;
function busStopMaterial(): THREE.MeshBasicMaterial {
  if (!busMat) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f4f1e8";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#c7433b";
    ctx.fillRect(0, 0, 128, 34);
    ctx.fillStyle = "#23282e";
    ctx.textAlign = "center";
    ctx.font = '38px "Hiragino Kaku Gothic", "Noto Sans CJK JP", "Yu Gothic", sans-serif';
    ctx.fillText("バス", 64, 82);
    ctx.font = '20px "Hiragino Kaku Gothic", "Noto Sans CJK JP", "Yu Gothic", sans-serif';
    ctx.fillText("のりば", 64, 112);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    busMat = new THREE.MeshBasicMaterial({ map: tex });
  }
  return busMat;
}

function buildProps(scene: THREE.Scene, path: RailPath) {
  for (let c = 0; c < VILLAGES.length; c++) {
    const p = positionAt(path, VILLAGES[c]);
    const t = tangentAt(path, VILLAGES[c]);
    const r = rightOf(t);
    const side = c % 2 === 0 ? 1 : -1;
    const yaw = Math.atan2(t.x, t.z);
    const ax = p.x + r.x * 11 * side;
    const az = p.z + r.z * 11 * side;
    const gy = heightAt(path, ax, az);

    // red post pillar
    const post = new THREE.Group();
    post.rotation.y = yaw;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.18, 0.16, 10),
      new THREE.MeshToonMaterial({ color: 0x6a6f78 }),
    );
    base.position.y = 0.08;
    post.add(base);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 1.0, 10),
      new THREE.MeshToonMaterial({ color: 0xc23b32 }),
    );
    barrel.position.y = 0.66;
    post.add(barrel);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.26, 0.2, 10),
      new THREE.MeshToonMaterial({ color: 0xc23b32 }),
    );
    cap.position.y = 1.26;
    post.add(cap);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.2), new THREE.MeshToonMaterial({ color: 0x23282e }));
    slot.position.set(0.23, 1.0, 0);
    post.add(slot);
    post.position.set(ax, gy, az);
    scene.add(post);

    // bus-stop board two metres down the street
    const bx = p.x + r.x * 11 * side + t.x * 2;
    const bz = p.z + r.z * 11 * side + t.z * 2;
    const bgy = heightAt(path, bx, bz);
    const stop = new THREE.Group();
    stop.rotation.y = yaw;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 2.3, 6),
      new THREE.MeshToonMaterial({ color: 0x6b5641 }),
    );
    pole.position.y = 1.15;
    stop.add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.55), busStopMaterial());
    board.rotation.y = Math.PI / 2; // face the signage outward along the street
    board.position.y = 2.05;
    stop.add(board);
    stop.position.set(bx, bgy, bz);
    scene.add(stop);
  }
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
  // two catenary-sagged wires per pole span, sampled in short segments so
  // the droop reads; pole tops themselves follow the ground line
  const pts: number[] = [];
  const steps = 8;
  for (let i = 1; i < tops.length; i++) {
    const a = tops[i - 1];
    const b = tops[i];
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps;
      const u1 = (k + 1) / steps;
      // [height offset from pole top, sag amplitude]
      for (const [h, sag] of [[0, 1.15], [-1.1, 0.95]] as const) {
        pts.push(
          a.x + (b.x - a.x) * u0, a.y + (b.y - a.y) * u0 + h - sag * 4 * u0 * (1 - u0), a.z + (b.z - a.z) * u0,
          a.x + (b.x - a.x) * u1, a.y + (b.y - a.y) * u1 + h - sag * 4 * u1 * (1 - u1), a.z + (b.z - a.z) * u1,
        );
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(geo, wireMat));
}

function buildHills(scene: THREE.Scene, path: RailPath) {
  buildBackdrop(scene, path); // far mountain bands, behind the green ridge line
  const nearMats = [0x6d9a6a, 0x7fa870, 0x629066, 0x79a862].map(
    (c) => new THREE.MeshToonMaterial({ color: c }),
  );
  // keep hills and their skirts clear of the corridor, else a cone base
  // lands beside the track and grows over the sky
  const clear = (x: number, z: number, base: number) => distanceToTrack(path, x, z) < base + 350;
  let seed = 5150;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.2 + rand() * 0.5;
    const rad = 2200 + rand() * 700;
    const h = 240 + rand() * 280;
    const r = h * (2.1 + rand() * 0.8);
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad + 1800;
    if (clear(x, z, r)) continue;
    const hill = new THREE.Mesh(
      jaggedCone(r, h, 5 + Math.floor(rand() * 3), 0.18, rand),
      nearMats[i % nearMats.length],
    );
    hill.name = "hill";
    hill.position.set(x, h / 2 - 40, z);
    scene.add(hill);
  }
}

// Radially jittered cone: irregular ridgeline instead of a crisp polygon.
function jaggedCone(r: number, h: number, seg: number, jitter: number, rand: () => number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ph1 = rand() * Math.PI * 2;
  const ph2 = rand() * Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const th = Math.atan2(z, x);
    const s = 1 + jitter * (0.6 * Math.sin(th * 3 + ph1) + 0.4 * Math.sin(th * 7 + ph2));
    pos.setX(i, x * s);
    pos.setZ(i, z * s);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// Mountain range: three rings of jagged silhouette cones behind the green
// hills — pale blue slate bluing with distance, snow-capped farthest out.
// Real geometry instead of a panorama texture: overlap hides cone seams.
function buildBackdrop(scene: THREE.Scene, path: RailPath) {
  // keep cone skirts clear of the corridor
  const clear = (x: number, z: number, base: number) => distanceToTrack(path, x, z) < base + 350;
  let seed = 90210;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const snowMat = new THREE.MeshToonMaterial({ color: 0xf4f8fc });
  const rings: { count: number; rad: number; spread: number; h: number; hSpread: number; wide: number; colors: number[]; snow: number }[] = [
    { count: 20, rad: 3900, spread: 450, h: 240, hSpread: 300, wide: 2.0, colors: [0x7f9db1, 0x8aa6b5, 0x799683], snow: 0 },
    { count: 22, rad: 4900, spread: 450, h: 420, hSpread: 520, wide: 1.6, colors: [0x9db6cf, 0xa8bfd6], snow: 780 },
    { count: 20, rad: 5900, spread: 500, h: 520, hSpread: 600, wide: 1.3, colors: [0xbecde1, 0xc8d5e6], snow: 900 },
  ];
  const mats = rings.map((rg) => rg.colors.map((c) => new THREE.MeshToonMaterial({ color: c })));
  for (const [ri, rg] of rings.entries()) {
    for (let i = 0; i < rg.count; i++) {
      const a = ((i + rand() * 0.6) / rg.count) * Math.PI * 2;
      const rad = rg.rad + rand() * rg.spread;
      const h = rg.h + rand() * rg.hSpread;
      const r = h * (rg.wide + rand() * 0.6);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad + 1800;
      if (clear(x, z, r)) continue;
      const peak = new THREE.Mesh(
        jaggedCone(r, h, 5 + Math.floor(rand() * 3), 0.15, rand),
        mats[ri][(i + ri) % mats[ri].length],
      );
      peak.name = "hill";
      peak.position.set(x, h / 2 - 40, z);
      scene.add(peak);
      if (h > rg.snow) {
        const sr = r * 0.42;
        const sh = h * 0.32;
        const snow = new THREE.Mesh(jaggedCone(sr, sh, 4 + Math.floor(rand() * 3), 0.1, rand), snowMat);
        snow.name = "hill";
        snow.position.set(x + r * 0.08, h - sh / 2 - 40, z - r * 0.06);
        snow.rotation.y = rand() * Math.PI;
        scene.add(snow);
      }
    }
  }
}

// Unit gable prism, ridge along local Z, footprint 1x1, height 1. Scaled per
// house (and the station building) so every roof reuses one geometry.
export const GABLE = (() => {
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

// hipped roof, same scale contract as GABLE (unit footprint, apex at y=1,
// ridge along local z spanning the middle half) — the squared-off Japanese
// style so not every house is a western gable
const HIP = (() => {
  const k = 0.25;
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [
    ...a, ...b, ...c,
    ...a, ...c, ...d,
  ];
  const tri = (a: number[], b: number[], c: number[]) => [...a, ...b, ...c];
  const v = [
    ...quad([0, 1, -k], [0.5, 0, -0.5], [0.5, 0, 0.5], [0, 1, k]), // slope +X
    ...quad([0, 1, k], [-0.5, 0, 0.5], [-0.5, 0, -0.5], [0, 1, -k]), // slope -X
    ...tri([0, 1, k], [0.5, 0, 0.5], [-0.5, 0, 0.5]), // hip end +Z
    ...tri([0, 1, -k], [-0.5, 0, -0.5], [0.5, 0, -0.5]), // hip end -Z
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

// long face gives houses readable fronts, lazily built: module tests run in
// node without DOM.
// Shop boards: white field, coloured frame matching the awning, one big trade
// kanji with 屋 beneath, and noren stripes filling the far half of the wide
// face. Lazily cached per (kind, frame) pair.
const shopSignMats = new Map<string, THREE.MeshBasicMaterial>();
function shopSignMaterial(i: number): THREE.MeshBasicMaterial {
  const key = `${i % 4}-${i % 2}`;
  let mat = shopSignMats.get(key);
  if (!mat) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const frame = ["#c7433b", "#396a94"][i % 2];
    ctx.fillStyle = "#f6f3ea";
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = frame;
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, 496, 240);
    ctx.fillStyle = "#23282e";
    ctx.textAlign = "center";
    ctx.font = '110px "Hiragino Kaku Gothic", "Noto Sans CJK JP", "Yu Gothic", sans-serif';
    ctx.fillText(["米", "菓", "喫", "薬"][i % 4], 140, 150);
    ctx.font = '64px "Hiragino Kaku Gothic", "Noto Sans CJK JP", "Yu Gothic", sans-serif';
    ctx.fillText("屋", 140, 236);
    // noren stripes on the right half
    ctx.fillStyle = frame;
    for (const sx of [320, 400, 470]) ctx.fillRect(sx, 16, 28, 224);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (const sx of [320, 400, 470]) ctx.fillRect(sx, 120, 28, 20);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshBasicMaterial({ map: tex });
    shopSignMats.set(key, mat);
  }
  return mat;
}

let facadeMats: Map<number, THREE.MeshBasicMaterial> | null = null;
// Three facade variants (door/window layouts) so neighbouring houses don't
// share a face; canvas 128×64, door+windows cut out with alpha, like before.
function facadeMaterial(v: number): THREE.MeshBasicMaterial {
  if (!facadeMats) facadeMats = new Map();
  let mat = facadeMats.get(v);
  if (mat) return mat;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  if (v === 1) {
    // mailbox door centre-left, small transom, mullioned warm panes right
    ctx.fillStyle = "#242b36";
    ctx.fillRect(16, 28, 20, 36);
    ctx.fillStyle = "#e9d9a6";
    ctx.fillRect(52, 20, 20, 18);
    ctx.fillRect(88, 20, 20, 18);
    ctx.fillStyle = "#3a3f47";
    ctx.fillRect(60, 20, 4, 18); // mullions
    ctx.fillRect(96, 27, 6, 4);
  } else if (v === 2) {
    // sliding-door shed: full-height door at the edge, one small window
    ctx.fillStyle = "#3a3f47";
    ctx.fillRect(92, 6, 28, 58);
    ctx.fillStyle = "#242b36";
    ctx.fillRect(2, 14, 22, 22);
  } else {
    ctx.fillStyle = "#242b36";
    ctx.fillRect(52, 22, 24, 42); // door
    ctx.fillRect(10, 18, 26, 22); // window
    ctx.fillRect(92, 18, 26, 22); // window
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 });
  facadeMats.set(v, mat);
  return mat;
}

let wallMats: Map<string, THREE.MeshToonMaterial> | null = null;
// Wall panels over the palette colour: white-based canvases multiply onto the
// toon tint — plaster mottle, horizontal planks, half-timber. Deterministic
// pattern per variant (fixed LCG seed) so the village looks the same every run.
function wallMaterial(v: number, color: number): THREE.MeshToonMaterial {
  if (!wallMats) wallMats = new Map();
  const key = `${v}-${color.toString(16)}`;
  let mat = wallMats.get(key);
  if (mat) return mat;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 128, 128);
  let seed = v * 137 + 41;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  if (v === 1) {
    // horizontal weather planks: tone bands + darker joint shadows
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = `rgba(120,95,70,${0.06 + rnd() * 0.07})`;
      ctx.fillRect(0, y, 128, 16);
      ctx.fillStyle = "rgba(70,52,38,0.4)";
      ctx.fillRect(0, y + 14, 128, 2);
      // staggered nail/blotch
      ctx.fillStyle = "rgba(90,70,50,0.25)";
      ctx.fillRect(rnd() * 120, y + 7, 3, 2);
    }
  } else if (v === 2) {
    // half-timber frame: dark beams at edges, mid studs and one diagonal
    ctx.fillStyle = "rgba(58,44,32,0.75)";
    ctx.fillRect(0, 0, 128, 6);
    ctx.fillRect(0, 122, 128, 6);
    ctx.fillRect(0, 0, 6, 128);
    ctx.fillRect(122, 0, 6, 128);
    ctx.fillRect(60, 0, 8, 128);
    ctx.fillRect(0, 60, 128, 6);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(58,44,32,0.6)";
    ctx.lineWidth = 7;
    ctx.moveTo(6, 122);
    ctx.lineTo(60, 66);
    ctx.stroke();
  } else {
    // plaster: soft mottling blotches
    for (let n = 0; n < 220; n++) {
      ctx.fillStyle = `rgba(125,105,82,${0.05 + rnd() * 0.08})`;
      ctx.fillRect(rnd() * 126, rnd() * 126, 3 + rnd() * 5, 3 + rnd() * 5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  mat = new THREE.MeshToonMaterial({ color, map: tex });
  wallMats.set(key, mat);
  return mat;
}

export function makeHouse(w: number, d: number, h: number, i: number, shop?: 1 | -1): THREE.Group {
  const house = new THREE.Group();
  // warmed wall palette: cream, sand, oat and two persimmon-toned houses so
  // the village reads warm under toon shading instead of grey
  const wallCol = [0xf1e3cd, 0xead0b8, 0xe0d5c5, 0xf0dcc8, 0xe4c9ae, 0xd98f6e][i % 6];
  // wall panels cycle plaster → planks → half-timber; facade layout varies
  // independently so neighbours differ on both counts
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    wallMaterial(i % 3, wallCol),
  );
  body.position.y = h / 2;
  house.add(body);

  // dark base skirt grounds the box against the grass
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.08, 0.34, d + 0.08),
    new THREE.MeshToonMaterial({ color: 0x5a5248 }),
  );
  skirt.position.y = 0.16;
  house.add(skirt);

  // gable or hipped roof, ridge along the longer axis, eaves overhanging;
  // per-house roof rise and a rotated colour pick so rooflines vary
  const longX = w >= d;
  const hip = i % 4 === 1; // every 4th house wears the squared-off hip
  const pitch = 1.15 + (i % 5) * 0.12;
  const roof = new THREE.Mesh(
    hip ? HIP : GABLE,
    new THREE.MeshToonMaterial({ color: [0x6a6f78, 0x8a4b3a, 0x4a5a6a, 0x555f6a][i % 4] }),
  );
  roof.rotation.y = longX ? Math.PI / 2 : 0;
  roof.scale.set(longX ? d * 1.15 : w * 1.15, pitch, longX ? w * 1.15 : d * 1.15);
  roof.position.y = h - 0.02;
  house.add(roof);

  // roof dressing: ridge cap on the apex, fascia boards under the long eaves —
  // all from one shared unit cube, scaled per house
  const eaveLong = (longX ? w : d) * 1.15;
  const eaveShort = (longX ? d : w) * 1.15; // cross-axis span of the overhang
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.1, 1),
    new THREE.MeshToonMaterial({ color: [0x4b5058, 0x6b4434, 0x3e4854, 0x474f58][i % 4] }),
  );
  cap.scale.z = hip ? eaveLong * 0.5 : eaveLong;
  cap.rotation.y = longX ? Math.PI / 2 : 0;
  cap.position.y = h - 0.02 + pitch + 0.02;
  house.add(cap);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.1, 1),
      new THREE.MeshToonMaterial({ color: 0x4e4640 }),
    );
    // slab runs along the long axis, sits at the cross-axis eaves edge
    f.scale.z = eaveLong + 0.04;
    f.rotation.y = longX ? Math.PI / 2 : 0;
    f.position.set(
      longX ? 0 : s * eaveShort / 2,
      h - 0.02 + 0.03,
      longX ? s * eaveShort / 2 : 0,
    );
    house.add(f);
  }

  // facade planes on the two long faces — layout variant follows the house
  // index offset from the wall variant so the pairings don't correlate
  const span = longX ? w : d;
  const rys = longX ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
  const facadeV = (i * 2 + 1) % 3;
  for (let k = 0; k < 2; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), facadeMaterial(facadeV));
    f.name = "facade";
    f.rotation.y = rys[k];
    f.scale.set(span * 0.88, h * 0.85, 1);
    if (longX) f.position.set(0, h * 0.52, k ? -(d / 2 + 0.02) : d / 2 + 0.02);
    else f.position.set(k ? -(w / 2 + 0.02) : w / 2 + 0.02, h * 0.52, 0);
    house.add(f);
  }

  // street-side shop dressing: canopy slab + kanji hanging board, above head
  // height (noren stripes fill the wide face so the board doesn't look
  // stretched — shop depth varies)
  if (shop) {
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.06, d * 0.7),
      new THREE.MeshToonMaterial({ color: i % 2 ? 0xd8524f : 0x396a94 }),
    );
    canopy.position.set(shop * (w / 2 + 0.28), 2.6, 0);
    house.add(canopy);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.9, d * 0.45),
      shopSignMaterial(i),
    );
    sign.position.set(shop * (w / 2 + 0.1), 3.2, 0);
    house.add(sign);
  }

  return house;
}

// ---- streamed scatter -------------------------------------------------------
// The layout is planned once (deterministic) and bucketed by tile; tiles only
// build/dispose the meshes for their own share.

export type TreeItem = { x: number; y: number; z: number; s: number; yaw: number; kind: "pine" | "broad" | "cherry" };
export type HouseItem = { x: number; y: number; z: number; w: number; d: number; h: number; i: number; yaw: number; shop?: 1 | -1 };
export type PaddyItem = { x: number; y: number; z: number; yaw: number };
export type FloraItem = { x: number; y: number; z: number; s: number; yaw: number; c: number };
export type Scatter = { trees: TreeItem[]; houses: HouseItem[]; paddies: PaddyItem[]; flowers: FloraItem[]; grass: FloraItem[] };

const TOWN_S = 3500;
const TOWN_CLEAR_RADIUS = 140;
// village cluster centres, shared by planScatter (houses) and buildProps
const VILLAGES = [140, 900, 1700, 2650, 3300];

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
  for (let i = 0; i < 2800 && trees.length < 1000; i++) {
    const x = (rand() - 0.5) * 1800;
    const z = (rand() - 0.5) * 4800 + 1800;
    const d = distanceToTrack(path, x, z);
    if (d < 30) continue;
    if (Math.hypot(x, z - TOWN_S) < TOWN_CLEAR_RADIUS) continue; // keep town clear
    const y = heightAt(path, x, z);
    if (y < -0.5) continue; // not in the river
    // pines take the open fields and higher ground; broadleafs cluster near
    // the line and the villages, with cherries sprinkled into garden trees
    const kind: TreeItem["kind"] =
      d > 150 || rand() < 0.35 ? "pine" : rand() < 0.3 ? "cherry" : "broad";
    const s = 0.8 + rand() * 1.4;
    trees.push({ x, y, z, s, yaw: s * 3, kind });
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
  for (let c = 0; c < VILLAGES.length; c++) {
    const center = VILLAGES[c];
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
    // y from the sheet's actual GPU interpolation — exact heightAt sits
    // under the mesh's ~0.5m corridor-edge bulge and buries the water
    paddies.push({ x, y: meshHeightAt(path, x, z) + 0.08, z, yaw: Math.atan2(t.x, t.z) });
  }
  // flooded plots grow only the sown seedlings — keep meadow flora out
  const inPaddy = (x: number, z: number) =>
    paddies.some((p) => (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < 188); // ~13.7m half-diagonal of the 22x16 plot
  for (let i = trees.length - 1; i >= 0; i--) if (inPaddy(trees[i].x, trees[i].z)) trees.splice(i, 1);

  // flower clusters in the corridor band, clumped like poppy drifts, not
  // uniform noise — concentrated where the follow camera actually sees them
  const flowers: FloraItem[] = [];
  const FLORA_COLORS = [0xe2534a, 0xf08a3c, 0xef8aa4, 0xf5f2ea, 0xf2c94c, 0x9a7ad6];
  const flowerRand = lcg(909090);
  for (let i = 0; i < 950 && flowers.length < 2000; i++) {
    const cx = (flowerRand() - 0.5) * 420;
    const cz = flowerRand() * 3600;
    const d = distanceToTrack(path, cx, cz);
    if (d < 18 || d > 120) continue;
    if (heightAt(path, cx, cz) < -0.5) continue;
    const count = 16 + Math.floor(flowerRand() * 20);
    const colorBase = Math.floor(flowerRand() * FLORA_COLORS.length);
    for (let k = 0; k < count; k++) {
      const a = flowerRand() * Math.PI * 2;
      const rr = flowerRand() * flowerRand() * 10; // biased to the cluster centre
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      if (heightAt(path, x, z) < -0.5) continue;
      if (inPaddy(x, z)) continue;
      // anchored to the cluster colour half the time, mixed otherwise, so
      // drifts have an identity without becoming monochrome
      // drifts have an identity without becoming monochrome
      const mixed = flowerRand() > 0.5;
      flowers.push({
        x,
        y: heightAt(path, x, z),
        z,
        s: 0.65 + flowerRand() * 0.75,
        yaw: flowerRand() * Math.PI,
        c: mixed
          ? Math.floor(flowerRand() * FLORA_COLORS.length)
          : (colorBase + (flowerRand() > 0.85 ? 1 : 0)),
      });
    }
  }

  // corridor meadow: instanced crossed-plane tufts with the shared vertex
  // sway. Marched along the line with a lateral step that widens with
  // distance: thick beside the rails (a tuft per ~4 m² at 9 m), thinning to a
  // light scatter by 260 m. Streaming tiles render only tufts near the
  // camera; one InstancedMesh per tile per material keeps draw calls low.
  const grass: FloraItem[] = [];
  const GRASS_COLORS = [0x66b245, 0x7ec454, 0x57a13c, 0x92cc63];
  const grassCap = Math.floor(160000 * GRASS_DENSITY);
  const rowStep = 2.0 / GRASS_DENSITY; // line-metres between rows
  const step = (lat: number) => (1.8 + lat * 0.06) / GRASS_DENSITY; // lateral gap
  const townP = positionAt(path, TOWN_S);
  for (let s = 0; s < path.totalLength && grass.length < grassCap; s += rowStep) {
    const p = positionAt(path, s);
    const t = tangentAt(path, s);
    const r = rightOf(t);
    for (const side of [-1, 1]) {
      for (let lat = 9 + rand() * 2; lat < 260 && grass.length < grassCap; lat += step(lat) * (0.7 + rand() * 0.6)) {
        const a = (rand() - 0.5) * rowStep;
        const x = p.x + r.x * side * lat + t.x * a;
        const z = p.z + r.z * side * lat + t.z * a;
        if (Math.hypot(x - townP.x, z - townP.z) < TOWN_CLEAR_RADIUS) continue;
        if (inPaddy(x, z)) continue;
        // the march already knows the lateral distance; skip re-measuring it
        const y = heightAt(path, x, z, lat);
        if (y < -0.5) continue;
        grass.push({
          x,
          y,
          z,
          s: 1.3 + rand() * 1.5,
          yaw: rand() * Math.PI,
          c: Math.floor(rand() * GRASS_COLORS.length),
        });
      }
    }
  }

  return { trees, houses, paddies, flowers, grass };
}

export function bucketScatter(scatter: Scatter, tileSize: number): Map<string, Scatter> {
  const buckets = new Map<string, Scatter>();
  const box = (item: { x: number; z: number }): Scatter => {
    const key = `${Math.floor(item.x / tileSize)},${Math.floor(item.z / tileSize)}`;
    let b = buckets.get(key);
    if (!b) { b = { trees: [], houses: [], paddies: [], flowers: [], grass: [] }; buckets.set(key, b); }
    return b;
  };
  for (const t of scatter.trees) box(t).trees.push(t);
  for (const h of scatter.houses) box(h).houses.push(h);
  for (const p of scatter.paddies) box(p).paddies.push(p);
  for (const f of scatter.flowers) box(f).flowers.push(f);
  for (const gr of scatter.grass) box(gr).grass.push(gr);
  return buckets;
}

// ---- tree geometries --------------------------------------------------------
// Canopies are baked taller than the trunk span so instance scale s puts the
// crown over the bole for every size. Built once at module level: pure
// geometry math, safe in node tests.

function coneAt(r: number, h: number, y: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 7);
  g.translate(0, y, 0);
  return g;
}

const PINE_CANOPY = mergeGeometries([
  coneAt(1.75, 2.8, 3.3),
  coneAt(1.32, 2.3, 4.6),
  coneAt(0.8, 1.7, 5.6),
]);

// Broadleaf/cherry crowns: crossed quads carrying a leaf-cluster atlas, like
// summer-cycle's foliage. The cutout texture makes the silhouette fluffy; the
// per-instance tint supplies the green (the atlas stays near-neutral).
function leafQuad(size: number, y: number, ry: number, rx = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX(rx);
  g.rotateY(ry);
  g.translate(0, y, 0);
  return g;
}
const LEAF_CANOPY = mergeGeometries([
  leafQuad(3.4, 3.3, 0),
  leafQuad(3.4, 3.3, Math.PI / 3),
  leafQuad(3.4, 3.3, (2 * Math.PI) / 3),
  leafQuad(2.8, 4.5, Math.PI / 4, -Math.PI / 2),
]);

const TRUNK_GEO = new THREE.CylinderGeometry(0.16, 0.3, 2.5, 6);
const TRUNK_MAT = new THREE.MeshToonMaterial({ color: 0x6b4a2b });
const CANOPY_MAT = new THREE.MeshToonMaterial({ color: 0xffffff });

const PINE_COLORS = [0x2f6f43, 0x3a7d50, 0x2a5e3a, 0x47855a];
const BROAD_COLORS = [0x58a24a, 0x6cb454, 0x4f9143, 0x76ae41, 0x8ab84f];
const CHERRY_COLORS = [0xf2a7c3, 0xf5b3c8, 0xe894b7, 0xfadbe8];

let leafMat: THREE.MeshToonMaterial | null = null;
function leafMaterial(): THREE.MeshToonMaterial {
  if (!leafMat) {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d")!;
    // near-neutral leaflets; instanceColor tints the whole clump
    let seed = 60606;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const tones = ["#9aa88e", "#c2cfae", "#e6eed6", "#f4f8e6"];
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.pow(rand(), 0.6) * 46;
      const x = S / 2 + Math.cos(a) * r;
      const y = 60 + Math.sin(a) * r * 0.92;
      ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
      ctx.beginPath();
      ctx.arc(x, y, 7 + rand() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    leafMat = new THREE.MeshToonMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  }
  return leafMat;
}

// ---- flora -------------------------------------------------------------------
// Textures need the DOM, so they are lazily built singletons; geometries are
// pure three.js math and safe at module level.

function crossedPlanes(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  const b = new THREE.PlaneGeometry(1, 1);
  b.rotateY(Math.PI / 2);
  return mergeGeometries([a, b]);
}

const FLORA_GEO = crossedPlanes();

const FLORA_COLORS = [0xe2534a, 0xf08a3c, 0xef8aa4, 0xf5f2ea, 0xf2c94c, 0x9a7ad6];
const GRASS_COLORS = [0x66b245, 0x7ec454, 0x57a13c, 0x92cc63];

// wind sway: a shared time uniform injected into the flora vertex shader.
// Phase comes from the instance's world offset, so each tuft moves
// independently without needing gl_InstanceID.
const swayUniforms = { uTime: { value: 0 } };
export function updateSway(time: number) {
  swayUniforms.uTime.value = time;
}
function addSway(mat: THREE.MeshToonMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime;",
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
        {
          float weight = max(position.y + 0.5, 0.0);
          float phase = instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.21;
          transformed.x += sin(uTime * 1.8 + phase) * 0.09 * weight;
          transformed.z += cos(uTime * 1.4 + phase * 1.3) * 0.07 * weight;
        }
        #endif
        `,
      );
  };
}

let flowerMat: THREE.MeshToonMaterial | null = null;
function flowerMaterial(): THREE.MeshToonMaterial {
  if (!flowerMat) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f0d968";
    ctx.beginPath();
    ctx.arc(32, 32, 8, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    flowerMat = new THREE.MeshToonMaterial({
      map: tex,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    addSway(flowerMat);
  }
  return flowerMat;
}

let grassMat: THREE.MeshToonMaterial | null = null;
function grassMaterial(): THREE.MeshToonMaterial {
  if (!grassMat) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    // three tapered blades from the base
    for (const [bx, tipX, tipY] of [
      [22, 10, 4],
      [32, 32, 0],
      [42, 54, 6],
    ] as [number, number, number][]) {
      ctx.beginPath();
      ctx.moveTo(bx - 5, 63);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(bx + 5, 63);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    grassMat = new THREE.MeshToonMaterial({
      map: tex,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    addSway(grassMat);
  }
  return grassMat;
}

// paddy: water sheet with painted rice rows + banks, one shared material
let paddyMat: THREE.MeshToonMaterial | null = null;
function paddyRiceMaterial(): THREE.MeshToonMaterial {
  if (!paddyMat) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    // flooded water base, light enough to catch the sky; sparse seedling
    // rows so open water dominates the plot like the refs
    ctx.fillStyle = "#aed2e8";
    ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(8, 12, 112, 6);
    ctx.fillRect(20, 30, 96, 3);
    // rice seedling rows — thin, open water between
    ctx.fillStyle = "#5e8f3e";
    for (let y = 14; y < 96; y += 20) {
      ctx.fillRect(0, y, 128, 6);
      ctx.fillStyle = "#7fb551";
      ctx.fillRect(0, y + 4, 128, 2);
      ctx.fillStyle = "#5e8f3e";
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    paddyMat = new THREE.MeshToonMaterial({ map: tex });
    // cheap planar reflection: the flooded base blends a view-dependent sky
    // colour (grazing angles reflect the horizon) — reads as a mirror without
    // a second render pass per paddy
    paddyMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          {
            vec3 dir = normalize(vWorld - cameraPosition); // camera → fragment
            float fr = pow(1.0 - clamp(-dir.y, 0.0, 1.0), 2.2);
            vec3 r = vec3(dir.x, -dir.y, dir.z);
            vec3 sky = mix(vec3(0.914, 0.953, 0.973), vec3(0.373, 0.690, 0.925), clamp(r.y * 1.3, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, sky, clamp(fr, 0.0, 0.85));
          }`,
        );
    };
  }
  return paddyMat;
}

const UP = new THREE.Vector3(0, 1, 0);

function addCanopy(
  g: THREE.Group,
  items: TreeItem[],
  geo: THREE.BufferGeometry,
  colors: number[],
  mat: THREE.Material,
): void {
  if (items.length === 0) return;
  const canopy = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  items.forEach((t, i) => {
    q.setFromAxisAngle(UP, t.yaw);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
    canopy.setMatrixAt(i, m);
    canopy.setColorAt(i, col.set(colors[i % colors.length]));
  });
  canopy.instanceMatrix.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  g.add(canopy);
}

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
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), paddyRiceMaterial());
    plane.rotation.x = -Math.PI / 2;
    pg.add(plane);
    // banks read as pale earthen ridges between flooded plots, like the refs
    const bankMat = new THREE.MeshToonMaterial({ color: 0xb49c6a });
    for (const bx of [-11, 11]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 16), bankMat);
      bank.position.set(bx, 0.12, 0);
      pg.add(bank);
    }
    const endBank = new THREE.Mesh(new THREE.BoxGeometry(22.5, 0.4, 0.6), bankMat);
    endBank.position.set(0, 0.1, -8);
    pg.add(endBank);
    pg.position.set(p.x, p.y, p.z);
    pg.rotation.y = p.yaw - Math.PI / 2;
    g.add(pg);
  }
  if (scatter.trees.length > 0) {
    const trees = scatter.trees;
    // one shared bole list for both kinds, then per-kind crowns
    const trunk = new THREE.InstancedMesh(TRUNK_GEO, TRUNK_MAT, trees.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(UP, t.yaw);
      m.compose(new THREE.Vector3(t.x, t.y + 1.15 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunk.setMatrixAt(i, m);
    });
    trunk.instanceMatrix.needsUpdate = true;
    g.add(trunk);
    addCanopy(g, trees.filter((t) => t.kind === "pine"), PINE_CANOPY, PINE_COLORS, CANOPY_MAT);
    addCanopy(g, trees.filter((t) => t.kind === "broad"), LEAF_CANOPY, BROAD_COLORS, leafMaterial());
    addCanopy(g, trees.filter((t) => t.kind === "cherry"), LEAF_CANOPY, CHERRY_COLORS, leafMaterial());
  }
  addFlora(g, scatter.flowers, flowerMaterial(), FLORA_COLORS);
  addFlora(g, scatter.grass, grassMaterial(), GRASS_COLORS);
  return g;
}

// flowers and grass share a crossed-plane billboard approach: one instanced
// mesh per tile per material, tinted per instance, base ON the ground plane
function addFlora(
  g: THREE.Group,
  items: FloraItem[],
  mat: THREE.MeshToonMaterial,
  colors: number[],
): void {
  if (items.length === 0) return;
  const inst = new THREE.InstancedMesh(FLORA_GEO, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  items.forEach((f, i) => {
    q.setFromAxisAngle(UP, f.yaw);
    m.compose(new THREE.Vector3(f.x, f.y + 0.42 * f.s, f.z), q, new THREE.Vector3(f.s, f.s, f.s));
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.set(colors[f.c % colors.length]));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  g.add(inst);
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
