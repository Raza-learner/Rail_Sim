import * as THREE from "three";
import type { RailPath } from "../core/rail";
import { positionAt } from "../core/rail";

const RIVER_Z = 1400;
const RIVER_HALF = 22;
const RIVER_DEPTH = -2.5;

// tunables: ground detail texture sizing / blend
const DETAIL_COARSE_M = 2.5; // metres per coarse detail tile
const DETAIL_FINE_M = 0.55; // metres per fine detail tile
const DETAIL_AMT = 0.75; // 0 = plain field texture, 1 = full detail noise

// tunables: low-frequency rolling hills added outside the track corridor
const ROLL_STRENGTH = 1.8; // 0 = flat ground, 1 = gentle ±3m undulation

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

export function heightAt(path: RailPath, x: number, z: number, knownDist?: number): number {
  const d = knownDist ?? distanceToTrack(path, x, z);
  const corridor = smoothstep(40, 210, d);
  // low meadow swells start a little off the line so the corridor floor is
  // not a billiard table; the station zone (<20 m) stays perfectly flat
  const swell = 1.1 * Math.sin(x * 0.045 + z * 0.02) * Math.cos(z * 0.031 + x * 0.017) * smoothstep(28, 90, d);
  // gentle rolling at ~200-370 m wavelengths, well above the mesh resolution
  // (~32 m quads), fading in with the corridor mask so the track stays flat
  const roll =
    ROLL_STRENGTH *
    corridor *
    (1.6 * Math.sin(x * 0.021 + z * 0.013) +
      1.2 * Math.cos(z * 0.017 - x * 0.008) +
      0.7 * Math.sin((x - 2 * z) * 0.033));
  let h = baseHeight(x, z) * corridor + swell + roll;

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
  // patchwork read. Boundaries are noise-dithered (plot colour bleeds out,
  // meadow green nibbles in) with irregular hand-painted borders, and plots
  // stay fully contained so tiling remains seamless.
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
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(px + dx, py + dy);
        ctx.rotate(a);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = fill;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        // noise-dithered boundary band: dots straddle the rect edge with
        // decaying alpha, dissolving the hard rectangle into the ground
        const BAND = 10;
        for (let n = 0; n < 90; n++) {
          const side = Math.floor(rand() * 4);
          const along = (rand() - 0.5) * (side < 2 ? h : w);
          const out = rand() * 2 - 1; // -1 inside .. +1 outside
          const depth = out * BAND;
          ctx.globalAlpha = 0.55 * (1 - Math.abs(out));
          ctx.fillStyle = out > 0 ? fill : "rgba(116,163,82,1)";
          const L = 2 + rand() * 4;
          if (side < 2) {
            const ex = (side === 0 ? 1 : -1) * (w / 2 + depth);
            ctx.fillRect(Math.min(ex, ex + L * (side === 0 ? -1 : 1)), along, L, 2 + rand() * 3);
          } else {
            const ey = (side === 2 ? 1 : -1) * (h / 2 + depth);
            ctx.fillRect(along, Math.min(ey, ey + L * (side === 2 ? -1 : 1)), 2 + rand() * 3, L);
          }
        }
        // crop rows: parallel strokes across the plot
        ctx.globalAlpha = 0.16;
        ctx.strokeStyle = "rgba(46,74,36,1)";
        ctx.lineWidth = 2;
        for (let r0 = -w / 2 + 7; r0 < w / 2 - 3; r0 += 9) {
          ctx.beginPath();
          ctx.moveTo(r0, -h / 2 + 3);
          ctx.lineTo(r0, h / 2 - 3);
          ctx.stroke();
        }
        // darker irregular border: dashed with random alpha/gaps, reads as a
        // painted edge instead of a ruled rectangle
        ctx.strokeStyle = "rgba(44,72,36,1)";
        ctx.lineWidth = 3.5;
        for (let e = 0; e < 4; e++) {
          const len = e < 2 ? h : w;
          const off = (e < 2 ? w / 2 : h / 2) * (e % 2 === 0 ? 1 : -1);
          for (let p0 = -len / 2; p0 < len / 2; p0 += 8) {
            if (rand() < 0.25) continue; // gaps
            ctx.globalAlpha = 0.2 + rand() * 0.3;
            ctx.beginPath();
            if (e < 2) {
              ctx.moveTo(off, p0);
              ctx.lineTo(off, Math.min(p0 + 6, len / 2));
            } else {
              ctx.moveTo(p0, off);
              ctx.lineTo(Math.min(p0 + 6, len / 2), off);
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
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

// Neutral-grey value-noise detail around 1.0 (±7%): multiplied over the
// field texture in the shader at two world scales (coarse mottling + fine
// tooth) so neither scale shows the tile.
function detailTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgb(235,235,235)";
  ctx.fillRect(0, 0, size, size);
  let seed = 2468;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  // wrapped mottling: soft light/dark clumps drawn at ±1 offsets so the tile
  // stays seamless
  for (let i = 0; i < 150; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 5 + rand() * 18;
    const a = 0.05 + rand() * 0.08;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(20,30,20,${a})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  // fine speckle for close-range tooth
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.5)" : "rgba(25,35,25,0.5)";
    ctx.globalAlpha = 0.5;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
  // vMapUv spans (size/260) field tiles across the plane, so a detail tile of
  // X metres repeats 260/X times per field tile — two desynced scales plus
  // the field texture break up any visible repetition
  const detail = detailTexture();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tDetail = { value: detail };
    shader.uniforms.uDetailAmt = { value: DETAIL_AMT };
    shader.uniforms.uDetailScale = {
      value: new THREE.Vector2(260 / DETAIL_COARSE_M, 260 / DETAIL_FINE_M),
    };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D tDetail;\nuniform float uDetailAmt;\nuniform vec2 uDetailScale;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      {
        float da = texture2D(tDetail, vMapUv * uDetailScale.x).r;
        float db = texture2D(tDetail, vMapUv * uDetailScale.y + vec2(0.37, 0.19)).r;
        diffuseColor.rgb *= mix(1.0, da * db, uDetailAmt);
      }`,
      );
  };
  // unique cache key: the map patch is terrain-only, don't let three share
  // the compiled program with other toon materials
  mat.customProgramCacheKey = () => "terrainDetail";
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
