import * as THREE from "three";

export const CAR_LENGTH = 20;
export const CAR_WIDTH = 2.9;
const GAP = 1.2;
export const TRAIN_LENGTH = CAR_LENGTH * 2 + GAP;

const CREAM = 0xf2e9d2;
const RED = 0xcf3a2c;
const ROOF = 0x9aa1a8;
const GLASS = 0x2b3b46;
const DARK = 0x22262b;
const METAL = 0x707880;
const LIGHT = 0xfff4c8;

const HALF = CAR_LENGTH / 2;

const HUB_GEO = new THREE.CylinderGeometry(0.16, 0.16, 0.2, 10);
const HUB_MAT = new THREE.MeshToonMaterial({ color: METAL });

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ color }));
}

// ---- canvas textures (DOM-dependent → lazy singletons) ----------------------

// Body livery: cream panels with faint seams every tile and a soft lower
// shade; tiles every ~3.3 m along the car so seams land as panel joints.
let liveryTex: THREE.Texture | null = null;
function liveryMaterial(): THREE.MeshToonMaterial {
  if (!liveryTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f2e9d2";
    ctx.fillRect(0, 0, 128, 128);
    const grad = ctx.createLinearGradient(0, 118, 0, 128);
    grad.addColorStop(0, "rgba(90,70,40,0)");
    grad.addColorStop(1, "rgba(90,70,40,0.16)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 118, 128, 10);
    ctx.fillStyle = "rgba(90,70,40,0.25)";
    ctx.fillRect(126, 0, 2, 128); // seam at tile edge
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(6, 1);
    liveryTex = tex;
  }
  return new THREE.MeshToonMaterial({ color: 0xffffff, map: liveryTex });
}

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

// A single car centred on the origin, length along Z (-HALF..+HALF).
function car(frontCab: boolean, rearCab: boolean): THREE.Group {
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 2.6, CAR_LENGTH), liveryMaterial());
  body.position.y = 2.35;
  g.add(body);

  const band = box(CAR_WIDTH + 0.04, 0.9, CAR_LENGTH, RED);
  band.position.y = 1.5;
  g.add(band);

  const windows = box(CAR_WIDTH + 0.04, 0.95, CAR_LENGTH - 0.8, GLASS);
  windows.position.y = 2.95;
  g.add(windows);

  // window mullions
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = -7.5 + i * 3.75;
      const m = box(0.06, 0.95, 0.3, CREAM);
      m.position.set(side * (CAR_WIDTH / 2 + 0.03), 2.95, z);
      g.add(m);
    }
    // doors
    for (const z of [4.6, -4.6]) {
      g.add(doorPanel(side, z));
    }
  }

  const roof = box(CAR_WIDTH - 0.35, 0.3, CAR_LENGTH - 0.4, ROOF);
  roof.position.y = 3.8;
  g.add(roof);
  for (const z of [-5.5, 5.5]) {
    const eq = box(1.3, 0.24, 2.4, METAL);
    eq.position.set(0, 4.02, z);
    g.add(eq);
  }
  if (frontCab) g.add(pantograph());

  const skirt = box(CAR_WIDTH - 0.12, 0.5, CAR_LENGTH - 0.5, DARK);
  skirt.position.y = 0.85;
  g.add(skirt);

  for (const bz of [-6.4, 6.4]) {
    const bogie = box(1.9, 0.5, 2.4, DARK);
    bogie.position.set(0, 0.62, bz);
    g.add(bogie);
    for (const side of [-1, 1]) {
      for (const wz of [bz - 0.85, bz + 0.85]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.18, 14),
          new THREE.MeshToonMaterial({ color: 0x15181c }),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 1.05, 0.42, wz);
        g.add(wheel);
        // bright hub face so the wheel reads as metal, not a flat disc
        const hub = new THREE.Mesh(HUB_GEO, HUB_MAT);
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

// A door leaf that can slide along the car body. side = +1 is the platform side.
function doorPanel(side: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const panel = box(0.08, 2.1, 1.3, CREAM);
  g.add(panel);
  const dw = box(0.05, 0.85, 1.05, GLASS);
  dw.position.set(side * 0.05, 0.75, 0);
  g.add(dw);
  g.position.set(side * (CAR_WIDTH / 2 + 0.03), 2.15, z);
  g.userData.door = { side: side as 1 | -1, rest: z };
  return g;
}

// Single-arm pantograph on the cab roof: base rails, one folded arm pair,
// and a contact head. Anchored near the cab for a classic suburban EMU look.
function pantograph(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, 0, 1.0);
  for (const x of [-0.5, 0.5]) {
    const rail = box(0.1, 0.05, 1.4, METAL);
    rail.position.set(x, 3.97, 0);
    g.add(rail);
    const ins = box(0.08, 0.2, 0.08, DARK);
    ins.position.set(x, 4.08, 0.15);
    g.add(ins);
  }
  // arm pairs tilt in the YZ plane; centers span base insulator → elbow → head
  for (const x of [-0.34, 0.34]) {
    const lower = box(0.07, 1.25, 0.07, METAL);
    lower.position.set(x, 4.56, -0.05);
    lower.rotation.x = -0.42;
    g.add(lower);
    const upper = box(0.07, 1.0, 0.07, METAL);
    upper.position.set(x, 5.4, 0.28);
    upper.rotation.x = 1.05;
    g.add(upper);
  }
  const head = box(1.55, 0.05, 0.15, DARK);
  head.position.set(0, 5.9, 0.72);
  g.add(head);
  return g;
}

// dir = +1 face at +Z, -1 face at -Z
function cab(dir: number): THREE.Group {
  const g = new THREE.Group();
  const face = dir * (HALF + 0.06);
  const out = (n: number) => dir * (HALF + n);

  const panel = box(CAR_WIDTH, 2.6, 0.14, CREAM);
  panel.position.set(0, 2.35, face);
  g.add(panel);

  const redBand = box(CAR_WIDTH + 0.02, 0.75, 0.1, RED);
  redBand.position.set(0, 1.6, out(0.1));
  g.add(redBand);

  for (const x of [-0.62, 0.62]) {
    const shield = box(1.0, 0.95, 0.1, GLASS);
    shield.position.set(x, 3.05, out(0.13));
    g.add(shield);
  }
  const divider = box(0.2, 0.95, 0.12, CREAM);
  divider.position.set(0, 3.05, out(0.13));
  g.add(divider);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.08), destinationMaterial());
  sign.position.set(0, 3.62, out(0.12));
  g.add(sign);

  for (const x of [-0.85, 0.85]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.1), new THREE.MeshBasicMaterial({ color: LIGHT }));
    lamp.position.set(x, 1.3, out(0.12));
    g.add(lamp);
  }

  const coupler = box(0.45, 0.4, 0.5, DARK);
  coupler.position.set(0, 0.85, out(0.28));
  g.add(coupler);
  for (const x of [-0.22, 0.22]) {
    const hose = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8),
      new THREE.MeshToonMaterial({ color: DARK }),
    );
    hose.rotation.x = Math.PI / 2;
    hose.position.set(x, 0.95, out(0.35));
    g.add(hose);
  }

  return g;
}

export type DoorRef = { mesh: THREE.Object3D; side: 1 | -1; rest: number };

export function createTrainModel(): THREE.Group {
  const train = new THREE.Group();

  const lead = car(true, false);
  lead.position.z = -HALF;
  train.add(lead);

  const trailing = car(false, true);
  trailing.position.z = -(CAR_LENGTH + GAP + HALF);
  train.add(trailing);

  const gangway = box(1.7, 2.3, GAP + 0.4, DARK);
  gangway.position.set(0, 2.2, -(CAR_LENGTH + GAP / 2));
  train.add(gangway);

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
