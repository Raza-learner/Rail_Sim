import * as THREE from "three";
import type { RailPath } from "../core/rail";
import { positionAt, tangentAt } from "../core/rail";
import type { StationStop } from "../core/types";

const PLATFORM = 0xb8bcc2;
const TACTILE = 0xe0b23a;
const CONCRETE = 0xa9adb3;

function rightOf(tangent: { x: number; z: number }): { x: number; z: number } {
  const len = Math.hypot(tangent.x, tangent.z) || 1;
  return { x: tangent.z / len, z: -tangent.x / len };
}

function platform(length: number, main: boolean): THREE.Group {
  const g = new THREE.Group();

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.9, length),
    new THREE.MeshToonMaterial({ color: PLATFORM }),
  );
  slab.position.y = 0.45;
  g.add(slab);

  const tactile = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.05, length * 0.98),
    new THREE.MeshToonMaterial({ color: TACTILE }),
  );
  tactile.position.set(-1.5, 0.92, 0);
  g.add(tactile);

  // canopy: roof on posts
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.15, length * 0.55),
    new THREE.MeshToonMaterial({ color: CONCRETE }),
  );
  roof.position.set(0.4, 3.4, 0);
  g.add(roof);
  for (const pz of [-length * 0.25, 0, length * 0.25]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 2.5, 0.2),
      new THREE.MeshToonMaterial({ color: 0x6b7076 }),
    );
    post.position.set(1.6, 2.15, pz);
    g.add(post);
  }

  if (main) {
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(7, 4, 14),
      new THREE.MeshToonMaterial({ color: 0xeef1f4 }),
    );
    building.position.set(6.5, 2, 0);
    g.add(building);
    const bRoof = new THREE.Mesh(
      new THREE.BoxGeometry(7.6, 0.4, 14.6),
      new THREE.MeshToonMaterial({ color: STRIPE }),
    );
    bRoof.position.set(6.5, 4.2, 0);
    g.add(bRoof);
    const entrance = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 2.4, 3),
      new THREE.MeshToonMaterial({ color: 0x16222e }),
    );
    entrance.position.set(3.05, 1.3, 0);
    g.add(entrance);
  }

  return g;
}

const STRIPE = 0x1e5aa8;

export function buildStations(scene: THREE.Scene, path: RailPath, stations: StationStop[], mainId: string) {
  for (const st of stations) {
    const pos = positionAt(path, st.distance);
    const tan = tangentAt(path, st.distance);
    const right = rightOf(tan);
    const g = platform(70, st.id === mainId);
    g.position.set(pos.x + right.x * 3.6, pos.y, pos.z + right.z * 3.6);
    g.rotation.y = Math.atan2(tan.x, tan.z);
    scene.add(g);
  }
}

export function buildRails(scene: THREE.Scene, path: RailPath) {
  const gauge = 0.7175;
  const railMat = new THREE.MeshToonMaterial({ color: 0x2b2f36 });
  const sleeperMat = new THREE.MeshToonMaterial({ color: 0x6b5136 });
  const ballastMat = new THREE.MeshToonMaterial({ color: 0x8f8a7e });

  const sleepers: { x: number; y: number; z: number; yaw: number }[] = [];

  for (let i = 1; i < path.nodes.length; i++) {
    const a = snapshot(path, path.cumDist[i - 1]);
    const b = snapshot(path, path.cumDist[i]);
    const len = path.segLengths[i - 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const dir = { x: b.x - a.x, z: b.z - a.z };
    const yaw = Math.atan2(dir.x, dir.z);
    const r = rightOf(dir);

    const ballast = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, len + 0.4), ballastMat);
    ballast.position.set(mid.x, mid.y - 0.08, mid.z);
    ballast.rotation.y = yaw;
    scene.add(ballast);

    for (const off of [-gauge, gauge]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, len + 0.3), railMat);
      rail.position.set(mid.x + r.x * off, mid.y + 0.16, mid.z + r.z * off);
      rail.rotation.y = yaw;
      scene.add(rail);
    }

    const count = Math.floor(len / 0.6);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      sleepers.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t + 0.02,
        z: a.z + (b.z - a.z) * t,
        yaw,
      });
    }
  }

  const inst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.6, 0.12, 0.24),
    sleeperMat,
    sleepers.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  sleepers.forEach((s, idx) => {
    q.setFromAxisAngle(up, s.yaw);
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, one);
    inst.setMatrixAt(idx, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  scene.add(inst);
}

function snapshot(path: RailPath, s: number) {
  const p = positionAt(path, s);
  return p;
}
