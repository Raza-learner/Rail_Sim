import * as THREE from "three";
import type { RailPath } from "../core/rail";
import { positionAt } from "../core/rail";

const RIVER_Z = 1400;
const RIVER_HALF = 22;
const RIVER_DEPTH = -2.5;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const sampleCache = new WeakMap<RailPath, { x: number; z: number }[]>();
function samplesFor(path: RailPath) {
  let s = sampleCache.get(path);
  if (!s) {
    s = [];
    for (let d = 0; d <= path.totalLength; d += 25) {
      const p = positionAt(path, d);
      s.push({ x: p.x, z: p.z });
    }
    sampleCache.set(path, s);
  }
  return s;
}

export function distanceToTrack(path: RailPath, x: number, z: number): number {
  const samples = samplesFor(path);
  let best = Infinity;
  for (const p of samples) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best) best = d;
    if (best < 1) break;
  }
  return best;
}

function baseHeight(x: number, z: number): number {
  return (
    16 * Math.sin(x * 0.0016) +
    12 * Math.cos(z * 0.0013) +
    18 * Math.sin((x + z) * 0.0009) +
    6 * Math.sin(x * 0.006 + z * 0.004)
  );
}

export function heightAt(path: RailPath, x: number, z: number): number {
  const d = distanceToTrack(path, x, z);
  const corridor = smoothstep(40, 210, d);
  let h = baseHeight(x, z) * corridor;

  const riverEdge = Math.abs(z - RIVER_Z);
  const river = 1 - smoothstep(RIVER_HALF, RIVER_HALF + 22, riverEdge);
  h = h * (1 - river) + RIVER_DEPTH * river;
  return h;
}

function fieldTexture(repeat: number): THREE.Texture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#6f9b4a";
  ctx.fillRect(0, 0, size, size);
  let seed = 1234;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 320; i++) {
    const w = 18 + rand() * 70;
    const h = 18 + rand() * 70;
    const x = rand() * size;
    const y = rand() * size;
    const s = 0.8 + rand() * 0.45;
    const warm = rand() > 0.7;
    ctx.fillStyle = warm
      ? `rgb(${Math.floor(150 * s)},${Math.floor(160 * s)},${Math.floor(80 * s)})`
      : `rgb(${Math.floor(105 * s)},${Math.floor(150 * s)},${Math.floor(70 * s)})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = "rgba(55,80,40,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x, rand() * size);
    ctx.lineTo(x + (rand() - 0.5) * 60, rand() * size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTerrain(scene: THREE.Scene, path: RailPath) {
  const size = 6000;
  const seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + 1800;
    pos.setY(i, heightAt(path, x, z));
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshToonMaterial({ map: fieldTexture(size / 130) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "terrain";
  mesh.position.z = 1800;
  scene.add(mesh);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, RIVER_HALF * 2 + 18),
    new THREE.MeshToonMaterial({ color: 0x2f8fbf, transparent: true, opacity: 0.9 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -1.2, RIVER_Z);
  scene.add(water);
}
