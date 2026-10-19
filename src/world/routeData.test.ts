import { describe, it, expect } from "vitest";
import { loadRoute, route } from "./routeData";

const ok = {
  name: "test line",
  nodes: [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 100 },
  ],
  speedLimits: [
    { fromDistance: 0, limitKmh: 40 },
    { fromDistance: 50, limitKmh: 60 },
  ],
  stations: [{ id: "a", distance: 0, tolerance: 2 }],
};

describe("loadRoute", () => {
  it("accepts the shipped route", () => {
    expect(route.name).toBe("Hinode – Yamabuki");
    expect(route.stations).toHaveLength(3);
  });

  it("accepts a valid custom route", () => {
    expect(loadRoute(ok).name).toBe("test line");
  });

  it("rejects broken input", () => {
    expect(() => loadRoute({ ...ok, name: "" })).toThrow(/name/);
    expect(() => loadRoute({ ...ok, nodes: [{ x: 0 }] })).toThrow(/node/);
    expect(() => loadRoute({ ...ok, speedLimits: [{ fromDistance: 50, limitKmh: 0 }] })).toThrow(/limitKmh/);
    expect(() => loadRoute({ ...ok, stations: [{ id: "a", distance: 10, tolerance: -1 }] })).toThrow(/tolerance/);
    expect(() => loadRoute({ ...ok, stations: [{ id: "", distance: 0, tolerance: 1 }] })).toThrow(/station.id/);
    // reversed speed limits must be last: it mutates ok.speedLimits in place
    expect(() => loadRoute({ ...ok, speedLimits: [...ok.speedLimits].reverse() })).toThrow(/ordered/);
  });
});
