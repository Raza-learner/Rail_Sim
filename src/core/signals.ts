import type { Route } from "./types";

export type SignalAspect = "clear" | "caution" | "danger";

export type Signal = {
  id: string;
  distance: number; // position along route
  blockEnd: number; // end of protected block
};

export function signalsForRoute(route: Route): Signal[] {
  return route.stations.map((st, i) => ({
    id: `sig-${st.id}`,
    distance: Math.max(0, st.distance - 150),
    blockEnd: i + 1 < route.stations.length ? route.stations[i + 1].distance : route.nodes ? Infinity : Infinity,
  }));
}

export function aspectFor(signal: Signal, trainDistance: number): SignalAspect {
  // danger if train in protected block
  if (trainDistance >= signal.distance && trainDistance < signal.blockEnd) return "danger";
  // caution if train in next block
  const nextBlockEnd = signal.blockEnd;
  if (trainDistance >= nextBlockEnd) {
    // look ahead one more? simple: caution if within 500m of signal
    if (signal.distance - trainDistance < 500) return "caution";
  }
  return "clear";
}

export function nearestSignal(signals: Signal[], distance: number): Signal | null {
  let best: Signal | null = null;
  let bestDist = Infinity;
  for (const s of signals) {
    const d = Math.abs(s.distance - distance);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}
