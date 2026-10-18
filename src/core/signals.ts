import type { Route } from "./types";

export type SignalAspect = "clear" | "caution" | "danger";

export type Signal = {
  id: string;
  distance: number; // position along route
  blockEnd: number; // end of protected block
};

function routeLength(route: Route): number {
  let total = 0;
  for (let i = 1; i < route.nodes.length; i++) {
    const a = route.nodes[i - 1], b = route.nodes[i];
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return total;
}

// Departure signals sit just past each station and protect the block to the next.
export function signalsForRoute(route: Route): Signal[] {
  const total = routeLength(route);
  return route.stations.map((st, i) => ({
    id: `sig-${st.id}`,
    distance: st.distance + 50,
    blockEnd: i + 1 < route.stations.length ? route.stations[i + 1].distance : total,
  }));
}

export function aspectFor(signal: Signal, trainDistance: number): SignalAspect {
  // danger if the train occupies the block this signal protects
  if (trainDistance >= signal.distance && trainDistance < signal.blockEnd) return "danger";
  return "clear";
}

// Prefer the nearest signal ahead of the train so the HUD shows the governing one.
export function nearestSignal(signals: Signal[], distance: number): Signal | null {
  let ahead: Signal | null = null;
  let aheadDist = Infinity;
  let behind: Signal | null = null;
  let behindDist = Infinity;
  for (const s of signals) {
    const d = s.distance - distance;
    if (d >= 0 && d < aheadDist) { aheadDist = d; ahead = s; }
    else if (d < 0 && -d < behindDist) { behindDist = -d; behind = s; }
  }
  return ahead ?? behind;
}
