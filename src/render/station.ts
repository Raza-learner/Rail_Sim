import * as THREE from "three";
import type { RailPath } from "../core/rail";
import { positionAt, tangentAt } from "../core/rail";
import type { StationStop } from "../core/types";
import { GABLE } from "./scenery";

const PLATFORM = 0xbfc3c9;
const TACTILE = 0xe0b23a;
const ROOF = 0x40566e;
const TRIM = 0xeef2f6;
const POST = 0x6e7883;
const METAL = 0x4a5560;

const NAME_KANJI: Record<string, string> = {
  hinode: "日の出",
  kawakami: "川上",
  yamabuki: "山吹",
};
const NAME_ROMAJI: Record<string, string> = {
  hinode: "Hinode",
  kawakami: "Kawakami",
  yamabuki: "Yamabuki",
};

function rightOf(tangent: { x: number; z: number }): { x: number; z: number } {
  const len = Math.hypot(tangent.x, tangent.z) || 1;
  return { x: tangent.z / len, z: -tangent.x / len };
}

// ---- lazily built canvas materials (tests run in node without DOM) ----------

let stationFacadeMat: THREE.MeshToonMaterial | null = null;
function stationFacade(): THREE.MeshToonMaterial {
  if (!stationFacadeMat) {
    // 3:1 to match the stretched plane: wall, amber windows, centre door
    const c = document.createElement("canvas");
    c.width = 384;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f4efe3";
    ctx.fillRect(0, 0, 384, 128);
    // a dark plinth grounds the building
    ctx.fillStyle = "#9aa2a8";
    ctx.fillRect(0, 116, 384, 12);
    for (const x of [36, 116, 224, 304]) {
      ctx.fillStyle = "#3a4658";
      ctx.fillRect(x - 3, 38, 62, 52);
      ctx.fillStyle = "#f6e6a8";
      ctx.fillRect(x, 41, 56, 46);
      ctx.fillStyle = "#e8d78e";
      ctx.fillRect(x, 62, 56, 3);
    }
    ctx.fillStyle = "#33404f";
    ctx.fillRect(172, 52, 44, 76);
    ctx.fillStyle = "#7f8892";
    ctx.fillRect(171, 52, 2, 76);
    ctx.fillRect(215, 52, 2, 76);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    stationFacadeMat = new THREE.MeshToonMaterial({ map: tex, alphaTest: 0.5 });
  }
  return stationFacadeMat;
}

const signCache = new Map<string, THREE.MeshBasicMaterial>();
function signMaterial(id: string): THREE.MeshBasicMaterial {
  let mat = signCache.get(id);
  if (!mat) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f7f9fa";
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = "#1f5fae";
    ctx.lineWidth = 7;
    ctx.strokeRect(6, 6, 244, 84);
    ctx.fillStyle = "#16324c";
    ctx.textAlign = "center";
    ctx.font = "700 44px 'Yu Gothic', 'Meiryo', 'Hiragino Sans', sans-serif";
    ctx.fillText(NAME_KANJI[id] ?? id, 128, 52);
    ctx.font = "600 20px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#50656f";
    ctx.fillText((NAME_ROMAJI[id] ?? id).toUpperCase(), 128, 80);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshBasicMaterial({ map: tex });
    signCache.set(id, mat);
  }
  return mat;
}

// ---- fittings ---------------------------------------------------------------

function lamp(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, 3, 6),
    new THREE.MeshToonMaterial({ color: 0x38404a }),
  );
  pole.position.y = 1.5;
  g.add(pole);
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.08, 0.08),
    new THREE.MeshToonMaterial({ color: 0x38404a }),
  );
  arm.position.set(-0.25, 3, 0);
  g.add(arm);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshToonMaterial({ color: 0xfff2c6, emissive: 0xfff3c0, emissiveIntensity: 0.7 }),
  );
  head.position.set(-0.5, 2.95, 0);
  g.add(head);
  g.position.set(x, 0.9, z);
  return g;
}

function bench(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshToonMaterial({ color: 0x7a5b3a });
  const steel = new THREE.MeshToonMaterial({ color: METAL });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 2.2), wood);
  seat.position.y = 0.48;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 2.2), wood);
  back.position.set(0.26, 0.75, 0);
  g.add(back);
  for (const dz of [-0.85, 0.85]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.08), steel);
    leg.position.set(0, 0.22, dz);
    g.add(leg);
  }
  g.position.set(x, 0.9, z);
  return g;
}

function vendingMachine(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.8, 0.7),
    new THREE.MeshToonMaterial({ color: 0xd64541 }),
  );
  body.position.y = 0.9;
  g.add(body);
  // dark glass front with a pale dispensing slot, facing the track
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 1.15),
    new THREE.MeshToonMaterial({ color: 0x2e3540 }),
  );
  front.rotation.y = -Math.PI / 2;
  front.position.set(-0.41, 1.08, 0);
  g.add(front);
  const slot = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.16),
    new THREE.MeshToonMaterial({ color: 0xdadfe4 }),
  );
  slot.rotation.y = -Math.PI / 2;
  slot.position.set(-0.42, 0.42, 0);
  g.add(slot);
  g.position.set(x, 0.9, z);
  return g;
}

function sign(id: string, x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 1.05),
    signMaterial(id),
  );
  board.rotation.y = -Math.PI / 2; // face the track (-x is track side)
  board.position.set(0, 1.7, 0);
  g.add(board);
  for (const dz of [-1.3, 1.3]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6),
      new THREE.MeshToonMaterial({ color: POST }),
    );
    post.position.set(0, 1.1, dz);
    g.add(post);
  }
  g.position.set(x, 0.9, z);
  return g;
}

function fence(length: number): THREE.Group {
  const g = new THREE.Group();
  const railMat = new THREE.MeshToonMaterial({ color: 0x9fb2c0 });
  const span = length * 0.86;
  for (const y of [1.25, 1.65]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, span), railMat);
    rail.userData.noOutline = true;
    rail.position.set(1.9, y, 0);
    g.add(rail);
  }
  const count = Math.floor(span / 6);
  for (let i = 0; i <= count; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), railMat);
    post.userData.noOutline = true;
    post.position.set(1.9, 1.32, -span / 2 + (i / count) * span);
    g.add(post);
  }
  return g;
}

function canopyRoof(length: number): THREE.Group {
  const g = new THREE.Group();
  const span = length * 0.8;
  // fascia trim under a dark roof reads as a proper station canopy
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.1, span + 0.2),
    new THREE.MeshToonMaterial({ color: TRIM }),
  );
  trim.position.set(-0.2, 3.22, 0);
  g.add(trim);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.14, span),
    new THREE.MeshToonMaterial({ color: ROOF }),
  );
  roof.position.set(-0.2, 3.34, 0);
  g.add(roof);
  const count = Math.max(2, Math.floor(span / 11));
  for (let i = 0; i <= count; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.35, 0.18), new THREE.MeshToonMaterial({ color: POST }));
    post.position.set(1.4, 2.05, -span / 2 + (i / count) * span);
    g.add(post);
  }
  return g;
}

function stationBuilding(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(8, 4.2, 12),
    new THREE.MeshToonMaterial({ color: 0xf4efe3 }),
  );
  body.position.set(7, 2.1, 0);
  g.add(body);
  // hips-free gable matches the house roof language; ridge along Z (depth)
  const roof = new THREE.Mesh(
    GABLE,
    new THREE.MeshToonMaterial({ color: ROOF }),
  );
  roof.scale.set(8.7, 1.5, 12.7);
  roof.position.set(7, 4.18, 0);
  g.add(roof);
  // clock: small pale disc beside the door, a familiar station detail
  const clock = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0xf7f9fa }),
  );
  clock.rotation.y = -Math.PI / 2;
  clock.position.set(2.94, 3.5, -3.2);
  g.add(clock);
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.3, 20),
    new THREE.MeshBasicMaterial({ color: 0x2c3a4c }),
  );
  clockFace.rotation.y = -Math.PI / 2;
  clockFace.position.set(2.93, 3.5, -3.2);
  g.add(clockFace);
  // flat facade plane (windows + door) on the track-facing wall
  const facade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), stationFacade());
  facade.name = "facade";
  facade.rotation.y = -Math.PI / 2;
  facade.scale.set(10.6, 3.4, 1);
  facade.position.set(2.96, 2.2, 0);
  g.add(facade);
  // entrance canopy over the door
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.1, 3.4),
    new THREE.MeshToonMaterial({ color: ROOF }),
  );
  awning.position.set(2.4, 2.75, 0);
  g.add(awning);
  return g;
}

function platform(length: number, main: boolean, id: string): THREE.Group {
  const g = new THREE.Group();

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.9, length),
    new THREE.MeshToonMaterial({ color: PLATFORM }),
  );
  slab.position.y = 0.45;
  g.add(slab);

  // white safety line along the track edge
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.02, length * 0.98),
    new THREE.MeshToonMaterial({ color: TRIM }),
  );
  edge.userData.noOutline = true;
  edge.position.set(-1.82, 0.91, 0);
  g.add(edge);

  const tactile = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.05, length * 0.98),
    new THREE.MeshToonMaterial({ color: TACTILE }),
  );
  tactile.userData.noOutline = true;
  tactile.position.set(-1.5, 0.92, 0);
  g.add(tactile);

  g.add(canopyRoof(length));
  g.add(fence(length));

  if (main) {
    g.add(stationBuilding());
    g.add(vendingMachine(1.45, -8.5));
    g.add(bench(1.0, 11));
  }

  g.add(sign(id, 0.9, main ? -13 : 0));
  for (const lz of main ? [-20, 0, 20] : [-10, 10]) g.add(lamp(0.9, lz));

  return g;
}

export function buildStations(scene: THREE.Scene, path: RailPath, stations: StationStop[], mainId: string) {
  for (const st of stations) {
    const pos = positionAt(path, st.distance);
    const tan = tangentAt(path, st.distance);
    const right = rightOf(tan);
    const g = platform(st.id === mainId ? 70 : 55, st.id === mainId, st.id);
    g.position.set(pos.x + right.x * 3.6, pos.y, pos.z + right.z * 3.6);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    scene.add(g);
  }
}

// Curved-path rail meshes: continuous triangle-strip ribbons instead of one
// box per polyline segment — the dense spline path would explode mesh count.
function addRibbon(
  scene: THREE.Scene,
  path: RailPath,
  lateral: number,
  width: number,
  y: number,
  mat: THREE.Material,
) {
  const n = path.nodes.length;
  const pos = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  let dist = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) dist += Math.hypot(path.nodes[i].x - path.nodes[i - 1].x, path.nodes[i].z - path.nodes[i - 1].z);
    const a = path.nodes[Math.max(0, i - 1)];
    const b = path.nodes[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    const rx = tz / len, rz = -tx / len;
    const cx = path.nodes[i].x + rx * lateral;
    const cz = path.nodes[i].z + rz * lateral;
    const cy = path.nodes[i].y + y;
    pos[i * 6 + 0] = cx + rx * width / 2;
    pos[i * 6 + 1] = cy;
    pos[i * 6 + 2] = cz + rz * width / 2;
    pos[i * 6 + 3] = cx - rx * width / 2;
    pos[i * 6 + 4] = cy;
    pos[i * 6 + 5] = cz - rz * width / 2;
    uv[i * 4 + 0] = 1;
    uv[i * 4 + 1] = dist / 8; // texture tile every 8 m along the line
    uv[i * 4 + 2] = 0;
    uv[i * 4 + 3] = uv[i * 4 + 1];
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    // CCW from above so strip normals face up (was culled: invisible ground-up)
    idx.push(i * 2, i * 2 + 1, (i + 1) * 2, i * 2 + 1, (i + 1) * 2 + 1, (i + 1) * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, mat));
}

// gravel with grass-fringe edges so the bed melts into the meadow: gravel
// spills past the bed edge and weeds colonise the margins
let ballastTex: THREE.Texture | null = null;
function ballastTexture(): THREE.Texture {
  if (!ballastTex) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    let seed = 424242;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    ctx.fillStyle = "#7aa85a";
    ctx.fillRect(0, 0, 256, 256);
    // gravel bed: ragged-edged horizontal band across the middle
    ctx.fillStyle = "#b7b3a7";
    for (let i = 0; i < 14; i++) {
      const x = i * 18 + rand() * 6;
      ctx.fillRect(x, 18 + rand() * 8, 16, 256 - 36 - rand() * 8);
    }
    // gravel spill + green regrowth dithering the bed edges: grey specks
    // scatter outward (fading with distance from the bed), green specks
    // nibble inward
    for (let i = 0; i < 450; i++) {
      const out = 4 + rand() * 30;
      ctx.globalAlpha = 0.5 * (1 - out / 34);
      ctx.fillStyle = rand() < 0.5 ? "rgba(183,179,167,1)" : "rgba(160,155,140,1)";
      const x = rand() * 252;
      ctx.fillRect(x, 34 - out, 2 + rand() * 3, 2 + rand() * 2);
      ctx.fillRect(252 - x, 222 + out, 2 + rand() * 3, 2 + rand() * 2);
    }
    ctx.globalAlpha = 1;
    // speckle
    for (let i = 0; i < 900; i++) {
      const y = 40 + rand() * 176;
      ctx.fillStyle = rand() > 0.5 ? "rgba(62,60,56,0.5)" : "rgba(226,222,212,0.55)";
      ctx.fillRect(rand() * 256, y, 2 + rand() * 2.5, 2);
    }
    // weeds: small green tufts colonising the bed, biased to the margins
    for (let i = 0; i < 160; i++) {
      const edge = rand() * 60;
      const y = rand() < 0.5 ? 24 + edge : 232 - edge;
      ctx.fillStyle = rand() < 0.5 ? "rgba(76,122,60,0.8)" : "rgba(95,143,74,0.7)";
      ctx.fillRect(rand() * 252, y, 2 + rand() * 2, 4 + rand() * 5);
    }
    // faint sleeper shadow bands every 0.6 m (13 per 8 m tile)
    ctx.fillStyle = "rgba(40,36,30,0.16)";
    for (let i = 0; i < 13; i++) ctx.fillRect(0, 24 + (i * 256) / 13, 256, 7);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    ballastTex = tex;
  }
  return ballastTex;
}

// trodden-earth maintenance path beside the bed: tan dirt with wheel ruts
// and grass fringing, so the corridor has a walking line like the refs
let dirtTex: THREE.Texture | null = null;
function dirtTexture(): THREE.Texture {
  if (!dirtTex) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    let seed = 515;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    ctx.fillStyle = "#c4a878";
    ctx.fillRect(0, 0, 128, 128);
    // wheel ruts
    ctx.fillStyle = "rgba(96,74,48,0.4)";
    ctx.fillRect(26, 0, 16, 128);
    ctx.fillRect(86, 0, 16, 128);
    // trodden speckle
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle =
        rand() > 0.5 ? "rgba(80,62,40,0.4)" : "rgba(232,214,178,0.5)";
      ctx.fillRect(rand() * 126, rand() * 126, 1.5 + rand() * 2.5, 1.5 + rand() * 2);
    }
    // grass fringe + weeds creeping in from both edges
    for (let i = 0; i < 150; i++) {
      const edge = rand() * 20;
      ctx.fillStyle = rand() < 0.5 ? "rgba(122,168,90,0.75)" : "rgba(95,143,74,0.65)";
      ctx.fillRect(rand() < 0.5 ? edge : 128 - edge, rand() * 126, 2 + rand() * 2, 2 + rand() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    dirtTex = tex;
  }
  return dirtTex;
}

export function buildRails(scene: THREE.Scene, path: RailPath) {
  const gauge = 0.7175;
  const railMat = new THREE.MeshToonMaterial({ color: 0x2b2f36 });
  const sleeperMat = new THREE.MeshToonMaterial({ color: 0x6b5136 });
  const ballastMat = new THREE.MeshToonMaterial({ map: ballastTexture() });

  // ballast bed and the two running rails as continuous ribbons; bed sits
  // just above the corridor ground (terrain is flat 0 inside the corridor)
  addRibbon(scene, path, 0, 6.2, 0.05, ballastMat);
  for (const off of [-gauge, gauge]) {
    addRibbon(scene, path, off, 0.14, 0.16, railMat);
  }
  // maintenance dirt path running beside the bed (disappears under any
  // platform or prop that crosses it, which reads as correct layering)
  addRibbon(scene, path, 5.5, 2.6, 0.035, new THREE.MeshToonMaterial({ map: dirtTexture() }));

  // sleepers at fixed 0.6 m intervals along arc length, aligned to tangent
  const count = Math.floor(path.totalLength / 0.6);
  const inst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.6, 0.12, 0.24),
    sleeperMat,
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < count; k++) {
    const p = positionAt(path, (k + 0.5) * 0.6);
    const t = tangentAt(path, (k + 0.5) * 0.6);
    q.setFromAxisAngle(up, Math.atan2(t.x, t.z));
    m.compose(new THREE.Vector3(p.x, p.y + 0.02, p.z), q, one);
    inst.setMatrixAt(k, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);
}
