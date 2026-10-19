import { describe, it, expect } from "vitest";
import { StationStopController } from "./stationStop";
import type { Route } from "./types";

const route: Route = {
  name: "test",
  nodes: [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 600 },
  ],
  speedLimits: [{ fromDistance: 0, limitKmh: 60 }],
  stations: [
    { id: "a", distance: 0, tolerance: 2 },
    { id: "b", distance: 500, tolerance: 2 },
  ],
};

describe("station stop", () => {
  it("cycles doors after a stop, then advances to the next station", () => {
    const ctrl = new StationStopController(route);

    // depart from the starting platform without a door cycle
    expect(ctrl.update(10, 2, 1 / 60).state).toBe("idle");

    // approach b
    expect(ctrl.update(255, 8, 1 / 60).state).toBe("approaching");
    expect(ctrl.update(430, 8, 1 / 60).state).toBe("braking");
    expect(ctrl.update(435, 4, 1 / 60).state).toBe("final");

    // creep into the tolerance and stop
    expect(ctrl.update(499.5, 0.2, 1 / 60).state).toBe("stopped");
    const stopped = ctrl.update(500, 0, 1 / 60);
    expect(stopped.doorsOpen).toBe(true);

    // doors stay open through the dwell, close when it ends
    expect(ctrl.update(500, 0, 2).doorsOpen).toBe(true);
    const done = ctrl.update(500, 0, 2.5);
    expect(done.doorsOpen).toBe(false);
    expect(done.state).toBe("ready");

    // leaving the platform moves on to the next station
    expect(ctrl.update(506, 2, 1 / 60).state).toBe("idle");
    expect(ctrl.update(560, 5, 1 / 60).stationId).toBe(null);
  });

  it("advances past a missed stop so later stations are still reachable", () => {
    const ctrl = new StationStopController(route);
    ctrl.update(10, 2, 1 / 60);
    // train passes station b at speed, never stopping
    ctrl.update(430, 20, 1 / 60);
    ctrl.update(490, 20, 1 / 60);
    ctrl.update(560, 20, 1 / 60);
    expect(ctrl.update(600, 20, 1 / 60).state).toBe("idle");
  });
});
