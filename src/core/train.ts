import type { Route, TrainState, TrainControls } from "./types";
import { tangentAt } from "./rail";
import type { RailPath } from "./rail";

const G = 9.81;
const MAX_ACCEL = 1.2; // m/s^2
const MAX_BRAKE = 2.5; // m/s^2
const DRAG_C0 = 0.05;
const DRAG_C1 = 0.002;
const DRAG_C2 = 0.0001;

export function speedLimitAt(route: Route, s: number): number {
  let limit = route.speedLimits[0]?.limitKmh ?? 80;
  for (const sl of route.speedLimits) {
    if (s >= sl.fromDistance) limit = sl.limitKmh;
    else break;
  }
  return limit;
}

export function stepTrain(
  state: TrainState,
  controls: TrainControls,
  route: Route,
  path: RailPath,
  dt: number,
): TrainState {
  const limitKmh = speedLimitAt(route, state.distance);
  const limitMs = (limitKmh * 1000) / 3600;

  const t = tangentAt(path, state.distance);
  const sinTheta = t.y; // approx for small gradients

  const reverser = controls.emergency ? 0 : controls.reverser;
  const power = controls.emergency ? 0 : controls.powerNotch;

  let brake = controls.emergency ? 1 : controls.brake;
  // overspeed penalty
  if (Math.abs(state.velocity) > limitMs + 0.5) brake = Math.max(brake, 0.6);

  const signV = state.velocity >= 0 ? 1 : -1;
  const absV = Math.abs(state.velocity);

  const tractionAccel = power * MAX_ACCEL * (reverser === 0 ? signV : reverser);
  // brake opposes velocity
  const brakeAccel = -signV * brake * MAX_BRAKE;
  const dragAccel = -signV * (DRAG_C0 + DRAG_C1 * absV + DRAG_C2 * absV * absV);
  const gradeAccel = -G * sinTheta;

  let a = tractionAccel + brakeAccel + dragAccel + gradeAccel;

  // prevent acceleration beyond limit
  if (Math.abs(state.velocity) >= limitMs && Math.sign(a) === Math.sign(state.velocity)) {
    a = 0;
  }

  let v = state.velocity + a * dt;
  // stop dead at zero if tiny
  if (Math.abs(v) < 0.05 && brake > 0) v = 0;

  let s = state.distance + v * dt;
  if (s < 0) { s = 0; v = 0; }
  if (s > path.totalLength) { s = path.totalLength; v = 0; }

  return { distance: s, velocity: v };
}
