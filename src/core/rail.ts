import type { RailNode, Vec3 } from "./types";

export type RailPath = {
  /** dense polyline samples (~3 m spacing) tracing the curved centreline */
  nodes: RailNode[];
  segLengths: number[];
  cumDist: number[]; // cumDist[i] = distance to sample i
  totalLength: number;
};

export const SAMPLE_STEP = 3;

// Uniform Catmull-Rom basis: passes through P1..P2 with C1 tangent continuity.
function catmull(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) };
}

// Snaps the control nodes into a smooth curve: each control segment is
// resampled every ~SAMPLE_STEP metres along its Catmull-Rom arc, so positions
// and tangents vary continuously through junctions instead of snapping at
// corner vertices.
export function buildRail(nodes: RailNode[]): RailPath {
  const pts: Vec3[] = [];
  const n = nodes.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = nodes[Math.max(0, i - 1)];
    const p1 = nodes[i];
    const p2 = nodes[i + 1];
    const p3 = nodes[Math.min(n - 1, i + 2)];
    // estimate this spline segment's arc length to pick a sample count
    let len = 0;
    let prev = catmull(p0, p1, p2, p3, 0);
    for (let k = 1; k <= 24; k++) {
      const q = catmull(p0, p1, p2, p3, k / 24);
      len += Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z);
      prev = q;
    }
    const steps = Math.max(8, Math.ceil(len / SAMPLE_STEP));
    for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
      pts.push(catmull(p0, p1, p2, p3, k / steps));
    }
  }

  const segLengths: number[] = [];
  const cumDist: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(
      pts[i].x - pts[i - 1].x,
      pts[i].y - pts[i - 1].y,
      pts[i].z - pts[i - 1].z,
    );
    segLengths.push(len);
    cumDist.push(cumDist[i - 1] + len);
  }
  return {
    nodes: pts,
    segLengths,
    cumDist,
    totalLength: cumDist[cumDist.length - 1],
  };
}

// index of the sample at or before s (binary search over the cumulative table)
function segmentIndex(path: RailPath, s: number): number {
  const d = s;
  let lo = 0;
  let hi = path.segLengths.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path.cumDist[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function positionAt(path: RailPath, s: number): Vec3 {
  const clamped = Math.max(0, Math.min(path.totalLength, s));
  const i = segmentIndex(path, clamped);
  const a = path.nodes[i];
  const b = path.nodes[Math.min(path.nodes.length - 1, i + 1)];
  const segLen = path.segLengths[i] || 1;
  const t = segLen > 0 ? (clamped - path.cumDist[i]) / segLen : 0;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function tangentAt(path: RailPath, s: number): Vec3 {
  const clamped = Math.max(0, Math.min(path.totalLength, s));
  // centred difference over a small window; the dense samples keep this
  // accurate without being noisy
  const h = SAMPLE_STEP * 0.5;
  const a = positionAt(path, Math.max(0, clamped - h));
  const b = positionAt(path, Math.min(path.totalLength, clamped + h));
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len === 0) {
    // at the extreme ends the window may degenerate; fall back to segment dir
    const i = segmentIndex(path, clamped);
    dx = path.nodes[i + 1].x - path.nodes[i].x;
    dy = path.nodes[i + 1].y - path.nodes[i].y;
    dz = path.nodes[i + 1].z - path.nodes[i].z;
    const l2 = Math.hypot(dx, dy, dz) || 1;
    dx /= l2; dy /= l2; dz /= l2;
    return { x: dx, y: dy, z: dz };
  }
  return { x: dx / len, y: dy / len, z: dz / len };
}
