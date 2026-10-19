import { describe, it, expect } from "vitest";
import { buildRail } from "../core/rail";
import { routeNodes } from "../world/routeData";
import { heightAt } from "../render/terrain";

describe("terrain", () => {
  const path = buildRail(routeNodes);
  it("is flat next to the track", () => {
    expect(Math.abs(heightAt(path, 60, 700))).toBeLessThan(0.1);
  });
  it("rises away from the track", () => {
    expect(Math.abs(heightAt(path, 500, 700))).toBeGreaterThan(0.5);
  });
  it("carves a river bed at the bridge", () => {
    expect(heightAt(path, 300, 1400)).toBeLessThan(-1);
  });
});
