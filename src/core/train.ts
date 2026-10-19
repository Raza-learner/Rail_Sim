import type { Route, TrainState, TrainControls } from "./types";
import { tangentAt } from "./rail";
import type { RailPath } from "./rail";

// Physical constants of a short 3-car commuter EMU consist.
const G = 9.81;
const MASS = 160000; // kg (loaded)
const TRACTION_A_MAX = 1.0; // m/s^2 available below the power taper
const POWER_W = 8e5; // 800 kW consist motor input ceiling
const SERVICE_BRAKE = 1.1; // m/s^2 deceleration at full service notch
const EMERGENCY_BRAKE = 2.0; // m/s^2
// Davis-style resistance expressed as deceleration (m/s^2) at speed v:
// rolling term, mechanical drag term, aerodynamic term.
const RES_C0 = 0.04;
const RES_C1 = 0.0009;
const RES_C2 = 0.00012;

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

  const emergency = controls.emergency;
  const brakeNotch = emergency ? 1 : Math.min(1, Math.max(0, controls.brake));
  const powerNotch = emergency ? 0 : Math.min(1, Math.max(0, controls.powerNotch));
  const reverser = emergency ? 0 : controls.reverser;

  const v = state.velocity;
  const av = Math.abs(v);
  const signV = v > 0 ? 1 : v < 0 ? -1 : 0;

  // overspeed governor: dips the brakes in automatically past the posted limit
  const governorBrake =
    !emergency && av > limitMs + 0.5 ? Math.max(brakeNotch, 0.6) : brakeNotch;

  // --- traction --------------------------------------------------------------
  // Force-cap at low speed (real EMUs are torque-limited from standstill) +
  // constant-power taper: F = min(m·a_max, P / v), so acceleration sags as
  // speed climbs instead of staying flat.
  let fTraction = 0;
  if (reverser !== 0 && powerNotch > 0) {
    const fCeil = MASS * TRACTION_A_MAX;
    const fPower = POWER_W / Math.max(av, 3);
    fTraction = reverser * Math.min(fCeil, fPower) * powerNotch;
  }

  // --- braking ---------------------------------------------------------------
  // Braking force opposes motion; a full emergency stop is heavier than the
  // service notch.
  const brakeDec = emergency ? EMERGENCY_BRAKE : SERVICE_BRAKE;
  const fBrake = av > 0 ? -signV * governorBrake * MASS * brakeDec : 0;

  // --- resistance --------------------------------------------------------------
  // Davis equation as deceleration: rolling, mechanical and aero terms.
  const aRes = RES_C0 + RES_C1 * av + RES_C2 * av * av;
  const fResist = av > 0 ? -signV * MASS * aRes : 0;

  // --- gradient ---------------------------------------------------------------
  // true slope from the normalised tangent, so gravity pulls the train back
  // on climbs and hurries it on descents
  const t = tangentAt(path, state.distance);
  const sinTheta = Math.max(-1, Math.min(1, t.y));
  const fGrade = -MASS * G * sinTheta;

  let a = (fTraction + fBrake + fResist + fGrade) / MASS;

  let vNext = v + a * dt;

  // braking/resistance may not push the train through zero into reverse; if
  // it would and no traction is applied, stop dead instead
  if (av > 0 && fTraction === 0 && Math.sign(vNext) !== signV) vNext = 0;
  // creeping stop: brake applied with no traction glues the train at stop
  if (governorBrake > 0 && fTraction === 0 && Math.abs(vNext) < 0.08) vNext = 0;
  // stationary on near-flat with no input stays stationary (no resistance drift)
  if (v === 0 && powerNotch === 0 && Math.abs(fGrade) < MASS * 0.002) vNext = 0;

  let s = state.distance + vNext * dt;
  if (s < 0) { s = 0; vNext = 0; }
  if (s > path.totalLength) { s = path.totalLength; vNext = 0; }

  return { distance: s, velocity: vNext };
}
