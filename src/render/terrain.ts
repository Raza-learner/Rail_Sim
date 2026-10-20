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
  // low meadow swells start a little off the line so the corridor floor is
  // not a billiard table; the station zone (<20 m) stays perfectly flat
  const swell = 1.1 * Math.sin(x * 0.045 + z * 0.02) * Math.cos(z * 0.031 + x * 0.017) * smoothstep(28, 90, d);
  let h = baseHeight(x, z) * corridor + swell;

  const riverEdge = Math.abs(z - RIVER_Z);
  const river = 1 - smoothstep(RIVER_HALF, RIVER_HALF + 22, riverEdge);
  h = h * (1 - river) + RIVER_DEPTH * river;
  return h;
}

// Painted farmland patchwork: crisp rotated plots with crop-row strokes and
// tan farm paths, like hand-painted anime field backgrounds. Soft hue blobs
// stay small in count unlike alleong noise so nothing reads as a stain.
function fieldTexture(repeat: number): THREE.Texture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#79b356";
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
  for (let i = 0; i < 22; i++) {
    const tone = tones[i % tones.length];
    drawBlob(rand() * size, rand() * size, 60 + rand() * 130, tone, 0.38, 0.75);
  }
  // golden drifts between plots: warmer fields catch the eye like the refs
  for (let i = 0; i < 5; i++) {
    drawBlob(rand() * size, rand() * size, 55 + rand() * 85, "#d3bb6d", 0.3);
  }
  // crisp-edged rotated field plots with crop rows inside — the core of the
  // patchwork read. Fully contained so tiling stays seamless.
  for (let i = 0; i < 11; i++) {
    const w = 80 + rand() * 140;
    const h = 60 + rand() * 110;
    const px = w + rand() * (size - 2 * w);
    const py = h + rand() * (size - 2 * h);
    const a = rand() * Math.PI;
    const fill = [
      "#6fae52", "#b7c565", "#d0be6a", "#a3ca7e", "#bda163", "#8cbb58",
      "#c9ad62", "#95c46c",
    ][i % 8];
    ctx.save();
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(px + dx, py + dy);
        ctx.rotate(a);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = fill;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        // crop rows: parallel strokes across the plot
        ctx.globalAlpha = 0.13;
        ctx.strokeStyle = "rgba(46,74,36,1)";
        ctx.lineWidth = 2;
        for (let r0 = -w / 2 + 7; r0 < w / 2 - 3; r0 += 9) {
          ctx.beginPath();
          ctx.moveTo(r0, -h / 2 + 3);
          ctx.lineTo(r0, h / 2 - 3);
          ctx.stroke();
        }
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = "rgba(44,72,36,1)";
        ctx.lineWidth = 4;
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    ctx.restore();
  }
  // tan farm paths dividing fields
  ctx.strokeStyle = "rgba(206,186,138,0.4)";
  ctx.lineWidth = 9;
  for (let i = 0; i < 3; i++) {
    const y = Math.round(rand() * size);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  const x = Math.round(rand() * size);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, size);
  ctx.stroke();
  // grass flecks: tiny dashes so close-range ground has tooth
  ctx.fillStyle = "rgba(56,88,52,0.22)";
  for (let i = 0; i < 450; i++) {
    ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 2, 2);
  }
  ctx.fillStyle = "rgba(210,238,160,0.2)";
  for (let i = 0; i < 300; i++) {
    ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8; // crisp plots at grazing angles instead of grey mush
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
