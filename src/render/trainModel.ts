import * as THREE from "three";

// ---- configuration ----------------------------------------------------------
// One place to tune the consist: car count, dimensions, livery colours.
export const TRAIN_CONFIG = {
  carCount: 3, // lead cab + intermediates + tail cab
  carLength: 20,
  carWidth: 2.9,
  carHeight: 2.7, // saloon figure, floor → roofline (roof gear adds on top)
  carGap: 1.2,
  bogieOffset: 6.4, // bogie centres from the car centre
  livery: {
    body: 0xf7f3e8, // warm white
    band: 0xd63b2b, // signal-red waist band
    stripe: 0xd63b2b, // thin accent stripe below the windows
    roof: 0x9aa1a8,
    glass: 0x2b3b46,
    skirt: 0x22262b,
    metal: 0x707880,
    headlight: 0xfff4c8,
    taillight: 0xe8564a,
  },
} as const;

// Back-compat exports (scene.ts camera math depends on TRAIN_LENGTH)
export const CAR_LENGTH = TRAIN_CONFIG.carLength;
export const CAR_WIDTH = TRAIN_CONFIG.carWidth;
export const TRAIN_LENGTH =
  TRAIN_CONFIG.carCount * CAR_LENGTH + (TRAIN_CONFIG.carCount - 1) * TRAIN_CONFIG.carGap;

const HALF = CAR_LENGTH / 2;
const L = TRAIN_CONFIG.livery;
const FLOOR_Y = 1.05; // body floor above the railhead plane

// ---- shared materials (one instance for the whole consist) ------------------
const MAT = {
  body: new THREE.MeshToonMaterial({ color: L.body }),
  band: new THREE.MeshToonMaterial({ color: L.band }),
  glass: new THREE.MeshToonMaterial({ color: L.glass }),
  roof: new THREE.MeshToonMaterial({ color: L.roof }),
  skirt: new THREE.MeshToonMaterial({ color: L.skirt }),
  metal: new THREE.MeshToonMaterial({ color: L.metal }),
  wheel: new THREE.MeshToonMaterial({ color: 0x15181c }),
  head: new THREE.MeshBasicMaterial({ color: L.headlight }),
  tail: new THREE.MeshBasicMaterial({ color: L.taillight }),
};

const HUB_GEO = new THREE.CylinderGeometry(0.16, 0.16, 0.2, 10);

// small BoxGeometry cache so repeated parts share vertex data
const boxCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
  let g = boxCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxCache.set(key, g);
  }
  return g;
}
function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(boxGeo(w, h, d), mat);
}

// ---- canvas textures (DOM-dependent → lazy singletons) ----------------------

// Destination blind: black roller with the terminus, backlit so it glows.
let destTex: THREE.Texture | null = null;
function destinationMaterial(): THREE.MeshBasicMaterial {
  if (!destTex) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#14181d";
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = "#f5f2ea";
    ctx.textAlign = "center";
    ctx.font = '34px "Hiragino Kaku Gothic", "Noto Sans CJK JP", "Yu Gothic", sans-serif';
    ctx.fillText("山吹", 128, 42);
    ctx.font = "13px sans-serif";
    ctx.fillText("Yamabuki", 128, 58);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    destTex = tex;
  }
  return new THREE.MeshBasicMaterial({ map: destTex });
}

// ---- lofted car body ---------------------------------------------------------

// CCW rounded-rect cross-section seen from +Z: flat floor, near-vertical sides
// with a small chin radius, curved shoulders, flat roof deck — the classic EMU
// figure. Points are CCW (x right, y up) so loft caps and quads face outward.
function sectionPoints(w: number, h: number, rr: number, rc: number, seg: number): number[] {
  const hw = w / 2;
  const pts: number[] = [];
  let lx = 0,
    ly = 0;
  const push = (x: number, y: number) => {
    if (pts.length && Math.abs(x - lx) < 1e-4 && Math.abs(y - ly) < 1e-4) return;
    pts.push(x, y);
    lx = x;
    ly = y;
  };
  const corner = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + ((a1 - a0) * k) / seg;
      push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    for (let k = 0; k <= seg; k++) push(x0 + ((x1 - x0) * k) / seg, y0 + ((y1 - y0) * k) / seg);
  };
  // chin right → right flank → right shoulder → roof deck → left shoulder →
  // left flank → chin left
  corner(hw - rc, rc, rc, -Math.PI / 2, 0);
  edge(hw, rc, hw, h - rr);
  corner(hw - rr, h - rr, rr, 0, Math.PI / 2);
  edge(hw - rr, h, -(hw - rr), h);
  corner(-(hw - rr), h - rr, rr, Math.PI / 2, Math.PI);
  edge(-hw, h - rr, -hw, rc);
  corner(-(hw - rc), rc, rc, Math.PI, 1.5 * Math.PI);
  return pts;
}

type Station = { z: number; w: number; h: number; rr: number; rc: number };

// Skins the cross-sections into one BufferGeometry along +Z with end caps.
function loft(stations: Station[]): THREE.BufferGeometry {
  const seg = 5;
  const S = stations.length;
  const secs = stations.map((s) => sectionPoints(s.w, s.h, s.rr, s.rc, seg));
  const N = secs[0].length / 2;
  const pos = new Float32Array((N * S + 2) * 3);
  for (let si = 0; si < S; si++) {
    const st = stations[si];
    for (let j = 0; j < N; j++) {
      const o = (si * N + j) * 3;
      pos[o] = secs[si][j * 2];
      pos[o + 1] = secs[si][j * 2 + 1] + FLOOR_Y;
      pos[o + 2] = st.z;
    }
  }
  // cap centres: average of the end rings
  const centre = (ring: number, out: number) => {
    let x = 0,
      y = 0;
    for (let j = 0; j < N; j++) {
      x += pos[(ring + j) * 3];
      y += pos[(ring + j) * 3 + 1];
    }
    pos[out * 3] = x / N;
    pos[out * 3 + 1] = y / N;
    pos[out * 3 + 2] = ring < N ? stations[0].z : stations[S - 1].z;
  };
  centre(0, N * S + 1); // rear cap centre
  centre((S - 1) * N, N * S); // front cap centre
  const idx: number[] = [];
  for (let si = 0; si < S - 1; si++) {
    for (let j = 0; j < N; j++) {
      const jn = (j + 1) % N;
      const a = si * N + j,
        b = si * N + jn,
        c = (si + 1) * N + jn,
        d = (si + 1) * N + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  for (let j = 0; j < N; j++) {
    // front cap faces +Z, rear cap faces −Z
    idx.push(N * S, (S - 1) * N + j, (S - 1) * N + ((j + 1) % N));
    idx.push(N * S + 1, (j + 1) % N, j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Nose taper milestones (t = metres from the tip; w/h as fractions of the full
// section). Turns the plain box cab end into a rounded, tapered EMU nose.
const TAPER = [
  { t: 0, w: 0.72, h: 0.745, rr: 0.24, rc: 0.08 },
  { t: 0.35, w: 0.755, h: 0.78, rr: 0.26, rc: 0.09 },
  { t: 0.9, w: 0.8, h: 0.83, rr: 0.32, rc: 0.11 },
  { t: 1.6, w: 0.87, h: 0.9, rr: 0.42, rc: 0.13 },
  { t: 2.3, w: 0.95, h: 0.97, rr: 0.5, rc: 0.14 },
];

const bodyCache = new Map<string, THREE.BufferGeometry>();
function bodyGeometry(front: boolean, back: boolean): THREE.BufferGeometry {
  const key = `${front ? 1 : 0}${back ? 1 : 0}`;
  const cached = bodyCache.get(key);
  if (cached) return cached;
  const FULL = { w: CAR_WIDTH, h: TRAIN_CONFIG.carHeight, rr: 0.55, rc: 0.14 };
  const tip = (p: (typeof TAPER)[number]): Omit<Station, "z"> => ({
    w: FULL.w * p.w,
    h: FULL.h * p.h,
    rr: p.rr,
    rc: p.rc,
  });
  const sts: Station[] = [];
  if (back) for (const p of TAPER) sts.push({ z: -HALF + p.t, ...tip(p) });
  sts.push({ z: -HALF + (back ? 3.0 : 0), ...FULL });
  if (front) for (const p of [...TAPER].reverse()) sts.push({ z: HALF - p.t, ...tip(p) });
  const geo = loft(sts);
  bodyCache.set(key, geo);
  return geo;
}

// ---- car assembly -----------------------------------------------------------

// An end coupler, shared by cab ends.
function coupler(dir: number): THREE.Group {
  const g = new THREE.Group();
  const out = (n: number) => dir * (HALF + n);
  const c = box(0.45, 0.4, 0.5, MAT.skirt);
  c.position.set(0, 0.85, out(0.28));
  g.add(c);
  for (const x of [-0.22, 0.22]) {
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), MAT.skirt);
    hose.rotation.x = Math.PI / 2;
    hose.position.set(x, 0.95, out(0.35));
    g.add(hose);
  }
  return g;
}

// Cab end dressing around the tapered nose: red mask, sloped windshield,
// destination blind, lamps (white at the head, red at the tail) and the
// coupler. dir = +1 nose at +Z, -1 nose at -Z.
function cab(dir: number): THREE.Group {
  const g = new THREE.Group();
  const out = (n: number) => dir * (HALF + n);

  const mask = box(2.05, 1.5, 0.06, MAT.band);
  mask.position.set(0, 2.45, out(0.03));
  g.add(mask);

  const windshield = box(1.9, 1.0, 0.07, MAT.glass);
  windshield.position.set(0, 2.38, out(0.08));
  windshield.rotation.x = -0.18 * dir;
  g.add(windshield);

  const sign = new THREE.Mesh(boxGeo(0.95, 0.24, 0.06), destinationMaterial());
  sign.position.set(0, 3.08, out(0.075));
  g.add(sign);

  for (const x of [-0.72, 0.72]) {
    const lamp = box(0.36, 0.24, 0.1, dir > 0 ? MAT.head : MAT.tail);
    lamp.position.set(x, 1.42, out(0.06));
    g.add(lamp);
  }

  g.add(coupler(dir));
  return g;
}

// A door leaf that can slide along the car body. side = +1 is the platform side.
function doorPanel(side: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const panel = box(0.08, 2.1, 1.3, MAT.body);
  g.add(panel);
  const dw = box(0.05, 0.85, 1.05, MAT.glass);
  dw.position.set(side * 0.05, 0.75, 0);
  g.add(dw);
  g.position.set(side * (CAR_WIDTH / 2 + 0.03), 2.15, z);
  g.userData.door = { side: side as 1 | -1, rest: z };
  return g;
}

// Single-arm pantograph on the cab roof. Anchored near the cab end (dir).
function pantograph(dir: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 0, dir * 1.0);
  for (const x of [-0.5, 0.5]) {
    const rail = box(0.1, 0.05, 1.4, MAT.metal);
    rail.position.set(x, 3.77, 0);
    g.add(rail);
    const ins = box(0.08, 0.2, 0.08, MAT.skirt);
    ins.position.set(x, 3.88, dir * 0.15);
    g.add(ins);
  }
  for (const x of [-0.34, 0.34]) {
    const lower = box(0.07, 1.25, 0.07, MAT.metal);
    lower.position.set(x, 4.36, dir * -0.05);
    lower.rotation.x = dir * -0.42;
    g.add(lower);
    const upper = box(0.07, 1.0, 0.07, MAT.metal);
    upper.position.set(x, 5.2, dir * 0.28);
    upper.rotation.x = dir * 1.05;
    g.add(upper);
  }
  const head = box(1.55, 0.05, 0.15, MAT.skirt);
  head.position.set(0, 5.7, dir * 0.72);
  g.add(head);
  return g;
}

// One car centred on the origin, length along Z (-HALF..+HALF). Cab ends taper;
// the middle of the consist uses the full plain section so all cars share one
// of at most three body geometries.
function car(frontCab: boolean, rearCab: boolean): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bodyGeometry(frontCab, rearCab), MAT.body));

  // livery: proud-of-skin bands, inset clear of the tapered noses
  const insetFront = frontCab ? 3.2 : 0;
  const insetBack = rearCab ? 3.2 : 0;
  const len = CAR_LENGTH - insetFront - insetBack;
  const cz = (insetBack - insetFront) / 2;

  const band = box(CAR_WIDTH + 0.05, 1.0, len, MAT.band);
  band.position.set(0, 1.6, cz);
  g.add(band);

  const stripe = box(CAR_WIDTH + 0.05, 0.09, len, MAT.band);
  stripe.position.set(0, 2.27, cz);
  g.add(stripe);

  const glassBand = box(CAR_WIDTH + 0.05, 0.7, len - 0.5, MAT.glass);
  glassBand.position.set(0, 2.85, cz);
  g.add(glassBand);

  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = -7.5 + i * 3.75;
      if ((z > HALF - insetFront - 0.9 && frontCab) || (z < -(HALF - insetBack - 0.9) && rearCab))
        continue;
      const m = box(0.06, 0.7, 0.3, MAT.body);
      m.position.set(side * (CAR_WIDTH / 2 + 0.04), 2.85, z);
      g.add(m);
    }
    for (const z of [4.6, -4.6]) {
      g.add(doorPanel(side, z));
    }
  }

  // roof-mounted AC units + a vent, sitting on the flat roof deck
  const deckY = FLOOR_Y + TRAIN_CONFIG.carHeight;
  for (const z of [-5.5, 5.5]) {
    const ac = box(1.1, 0.26, 2.6, MAT.metal);
    ac.position.set(0, deckY + 0.13, z);
    g.add(ac);
  }
  const vent = box(0.8, 0.14, 1.2, MAT.roof);
  vent.position.set(0, deckY + 0.07, 0);
  g.add(vent);

  if (frontCab && !rearCab) g.add(pantograph(1));
  else if (rearCab && !frontCab) g.add(pantograph(-1));
  else if (frontCab && rearCab) {
    g.add(pantograph(1));
    g.add(pantograph(-1));
  }

  const skirt = box(CAR_WIDTH - 0.55, 0.6, len - 0.5, MAT.skirt);
  skirt.position.set(0, 0.85, cz);
  g.add(skirt);

  for (const bz of [-TRAIN_CONFIG.bogieOffset, TRAIN_CONFIG.bogieOffset]) {
    const bogie = box(1.9, 0.5, 2.4, MAT.skirt);
    bogie.position.set(0, 0.62, bz);
    g.add(bogie);
    for (const side of [-1, 1]) {
      for (const wz of [bz - 0.85, bz + 0.85]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.18, 14),
          MAT.wheel,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 1.05, 0.42, wz);
        g.add(wheel);
        // bright hub face so the wheel reads as metal, not a flat disc
        const hub = new THREE.Mesh(HUB_GEO, MAT.metal);
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wheel.position);
        g.add(hub);
      }
    }
  }

  if (frontCab) g.add(cab(1));
  if (rearCab) g.add(cab(-1));
  return g;
}

export type DoorRef = { mesh: THREE.Object3D; side: 1 | -1; rest: number };

export function createTrainModel(): THREE.Group {
  const train = new THREE.Group();
  const n = Math.max(1, TRAIN_CONFIG.carCount);

  for (let i = 0; i < n; i++) {
    const c = car(i === 0, i === n - 1);
    c.position.z = -(i * (CAR_LENGTH + TRAIN_CONFIG.carGap) + HALF);
    train.add(c);
    if (i > 0) {
      // gangway bellows bridging the gap to the car ahead
      const z = -(i * (CAR_LENGTH + TRAIN_CONFIG.carGap) - TRAIN_CONFIG.carGap / 2);
      const gangway = box(1.7, 2.3, TRAIN_CONFIG.carGap + 0.4, MAT.skirt);
      gangway.position.set(0, 2.2, z);
      train.add(gangway);
    }
  }

  const doors: DoorRef[] = [];
  train.traverse((o) => {
    const door = o.userData.door as { side: 1 | -1; rest: number } | undefined;
    if (door) doors.push({ mesh: o, ...door });
  });
  train.userData.doors = doors;

  return train;
}

const DOOR_SLIDE = 1.35; // panel width: slides fully clear of the 1.3m doorway

// Doors slide along the car body on the platform side only.
// shortcut: every platform on this route is on the right; extend when a
// left-side platform appears.
export function updateTrainDoors(train: THREE.Group, t: number) {
  const doors = train.userData.doors as DoorRef[] | undefined;
  if (!doors) return;
  for (const d of doors) {
    d.mesh.position.z = d.side === 1 ? d.rest + Math.sign(d.rest) * t * DOOR_SLIDE : d.rest;
  }
}
