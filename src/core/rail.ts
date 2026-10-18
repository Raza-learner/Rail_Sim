import type { RailNode, Vec3 } from "./types";

export type RailPath = {
  nodes: RailNode[];
  segLengths: number[];
  cumDist: number[]; // cumDist[i] = distance to node i
  totalLength: number;
};

export function buildRail(nodes: RailNode[]): RailPath {
  const segLengths: number[] = [];
  const cumDist: number[] = [0];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    segLengths.push(len);
    cumDist.push(cumDist[i - 1] + len);
  }
  return { nodes, segLengths, cumDist, totalLength: cumDist[cumDist.length - 1] };
}

export function positionAt(path: RailPath, s: number): Vec3 {
  const clamped = Math.max(0, Math.min(path.totalLength, s));
  // find segment
  let i = 0;
  while (i < path.segLengths.length - 1 && clamped > path.cumDist[i + 1]) i++;
  const a = path.nodes[i];
  const b = path.nodes[i + 1];
  const segLen = path.segLengths[i] || 1;
  const t = (clamped - path.cumDist[i]) / segLen;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function tangentAt(path: RailPath, s: number): Vec3 {
  const clamped = Math.max(0, Math.min(path.totalLength, s));
  let i = 0;
  while (i < path.segLengths.length - 1 && clamped >= path.cumDist[i + 1]) i++;
  const a = path.nodes[i];
  const b = path.nodes[i + 1];
  const segLen = path.segLengths[i] || 1;
  return { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen, z: (b.z - a.z) / segLen };
}
