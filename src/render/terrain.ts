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

// Soft anime meadow: large low-contrast blobs blended with radial gradients
// instead of hard rectangles. Hard-edged patches at small repeat scales read
// as pixel camo from the follow camera; soft big features read as fields.
function fieldTexture(repeat: number): THREE.Texture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#83b262";
  ctx.fillRect(0, 0, size, size);
  let seed = 1234;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const tones = ["#6a9a4e", "#8bb96a", "#5f8f4a", "#98c375", "#61924c"];
  const drawBlob = (x: number, y: number, r: number, color: string, alpha: number, edge = 1) => {
    // paint at up to 9 wrapped offsets so the texture tiles seamlessly
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        if (x + dx < -r || x + dx > size + r || y + dy < -r || y + dy > size + r) continue;
        const g = ctx.createRadialGradient(x + dx, y + dy, r * 0.1, x + dx, y + dy, r);
        g.addColorStop(0, color);
        g.addColorStop(edge, color);
        g.addColorStop(1, `${color}00`);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
  };
  // crisp-edged rotated field plots: fully contained in the tile so tiling
  // stays seamless. This is what gives the farmland-patchwork read.
  for (let i = 0; i < 9; i++) {
    const w = 70 + rand() * 130;
    const h = 50 + rand() * 110;
    const px = w + rand() * (size - 2 * w);
    const py = h + rand() * (size - 2 * h);
    const a = rand() * Math.PI;
    const fill = [
      "#8fbb62", "#a9c977", "#7dab55", "#d0bb66", "#95c46c", "#c9ad62",
    ][i % 6];
    ctx.save();
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(px + dx, py + dy);
        ctx.rotate(a);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = fill;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = "rgba(58,84,46,0.35)";
        ctx.lineWidth = 3;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  for (let i = 0; i < 40; i++) {
    const tone = tones[i % tones.length];
    drawBlob(rand() * size, rand() * size, 60 + rand() * 130, tone, 0.5, 0.75);
  }
  // grass flecks: tiny darker dashes so close-range ground has tooth, while
  // far away they melt into general tone (small enough to alias away)
  ctx.fillStyle = "rgba(56,88,52,0.35)";
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.fillRect(x, y, 2 + rand() * 2, 2);
  }
  ctx.fillStyle = "rgba(210,238,160,0.28)";
  for (let i = 0; i < 500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.fillRect(x, y, 2 + rand() * 2, 2);
  }
  // golden farmland patches, more visible than before — the reference fields
  // alternate yellow-green plots against deep green
  for (let i = 0; i < 7; i++) {
    drawBlob(rand() * size, rand() * size, 55 + rand() * 85, "#d3bb6d", 0.34);
  }
  // light meadow highlights
  for (let i = 0; i < 12; i++) {
    drawBlob(rand() * size, rand() * size, 30 + rand() * 45, "#b0d48a", 0.3);
  }
  // blurred grid of field dividers: darker boundary lines so the plain reads
  // as cultivated plots divided by paths, like the flattened farmland view
  ctx.strokeStyle = "rgba(52,82,44,0.13)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const y = Math.round(rand() * size);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
    const x = Math.round(rand() * size);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildTerrain(scene: THREE.Scene, path: RailPath) {
  const size = 7200;
  const seg = 220;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + 1800;
    pos.setY(i, heightAt(path, x, z));
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshToonMaterial({ map: fieldTexture(size / 260) });
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
