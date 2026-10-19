import type { RailNode, Route, Vec3 } from "../core/types";
import routeJson from "./routes/hinode-yamabuki.json";

// Route files are a trust boundary: validate here so a future route editor's
// output cannot crash the sim half-way through a journey.
function num(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`route: ${what} must be a finite number`);
  return v;
}

export function loadRoute(data: unknown): Route {
  const d = (data ?? {}) as { name?: unknown; nodes?: unknown; speedLimits?: unknown; stations?: unknown };
  if (typeof d.name !== "string" || !d.name) throw new Error("route: name must be a non-empty string");

  if (!Array.isArray(d.nodes) || d.nodes.length < 2) throw new Error("route: nodes needs at least 2 entries");
  const nodes: RailNode[] = d.nodes.map((n) => {
    const o = n as Partial<Vec3> | null;
    if (!o || typeof o !== "object") throw new Error("route: each node must be an object");
    return { x: num(o.x, "node.x"), y: num(o.y, "node.y"), z: num(o.z, "node.z") };
  });

  if (!Array.isArray(d.speedLimits) || d.speedLimits.length === 0)
    throw new Error("route: speedLimits must be non-empty");
  let prevFrom = -Infinity;
  const speedLimits = d.speedLimits.map((sl) => {
    const o = sl as { fromDistance?: unknown; limitKmh?: unknown } | null;
    if (!o || typeof o !== "object") throw new Error("route: each speed limit must be an object");
    const fromDistance = num(o.fromDistance, "speedLimit.fromDistance");
    if (fromDistance < prevFrom) throw new Error("route: speedLimits must be ordered by fromDistance");
    prevFrom = fromDistance;
    const limitKmh = num(o.limitKmh, "speedLimit.limitKmh");
    if (limitKmh <= 0) throw new Error("route: limitKmh must be positive");
    return { fromDistance, limitKmh };
  });

  if (!Array.isArray(d.stations)) throw new Error("route: stations must be an array");
  let prevDist = -Infinity;
  const stations = d.stations.map((st) => {
    const o = st as { id?: unknown; distance?: unknown; tolerance?: unknown } | null;
    if (!o || typeof o !== "object") throw new Error("route: each station must be an object");
    if (typeof o.id !== "string" || !o.id) throw new Error("route: station.id must be a non-empty string");
    const distance = num(o.distance, "station.distance");
    if (distance < 0 || distance <= prevDist) throw new Error("route: station distances must be non-negative and ascending");
    prevDist = distance;
    const tolerance = num(o.tolerance, "station.tolerance");
    if (tolerance <= 0) throw new Error("route: station tolerance must be positive");
    return { id: o.id, distance, tolerance };
  });

  return { name: d.name, nodes, speedLimits, stations };
}

export const route = loadRoute(routeJson);
export const routeNodes: RailNode[] = route.nodes;
