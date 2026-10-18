import { describe, it, expect } from "vitest";
import { buildRail, positionAt, tangentAt } from "./rail";
import { routeNodes } from "../world/routeData";
import { stepTrain, speedLimitAt } from "./train";
import { route } from "../world/routeData";

describe("rail", () => {
  const path = buildRail(routeNodes);
  it("total length positive", () => {
    expect(path.totalLength).toBeGreaterThan(3000);
  });
  it("positionAt(0) is first node", () => {
    const p = positionAt(path, 0);
    expect(p.x).toBe(routeNodes[0].x);
    expect(p.z).toBe(routeNodes[0].z);
  });
  it("positionAt(total) is last node", () => {
    const p = positionAt(path, path.totalLength);
    const last = routeNodes[routeNodes.length - 1];
    expect(p.x).toBe(last.x);
    expect(p.z).toBe(last.z);
  });
  it("tangent length ~1", () => {
    const t = tangentAt(path, 100);
    const len = Math.hypot(t.x, t.y, t.z);
    expect(len).toBeCloseTo(1, 5);
  });
});

describe("train", () => {
  const path = buildRail(routeNodes);
  it("braking reduces speed", () => {
    let s = { distance: 100, velocity: 20 };
    const before = s.velocity;
    s = stepTrain(s, { powerNotch: 0, brake: 1, emergency: false, reverser: 1 }, route, path, 1 / 60);
    expect(s.velocity).toBeLessThan(before);
  });
  it("stops at end", () => {
    let s = { distance: path.totalLength - 1, velocity: 5 };
    s = stepTrain(s, { powerNotch: 0, brake: 1, emergency: false, reverser: 1 }, route, path, 10);
    expect(s.distance).toBeLessThanOrEqual(path.totalLength);
  });
  it("speedLimitAt returns finite", () => {
    expect(speedLimitAt(route, 0)).toBeGreaterThan(0);
  });
});
