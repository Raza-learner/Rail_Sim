import { describe, it, expect } from "vitest";
import { signalsForRoute, aspectFor, nearestSignal } from "./signals";
import { route } from "../world/routeData";

describe("signals", () => {
  const signals = signalsForRoute(route);
  it("starting at the platform is clear, not danger", () => {
    const sig = nearestSignal(signals, 0)!;
    expect(aspectFor(sig, 0)).toBe("clear");
  });
  it("signal shows danger when train enters its block", () => {
    const sig = signals[0];
    expect(aspectFor(sig, sig.distance + 10)).toBe("danger");
  });
});
