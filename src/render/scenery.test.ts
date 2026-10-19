import { describe, it, expect } from "vitest";
import { buildRail } from "../core/rail";
import { routeNodes } from "../world/routeData";
import { planScatter, bucketScatter, houseColliders } from "./scenery";

describe("scatter", () => {
  const path = buildRail(routeNodes);

  it("plans the same layout every time", () => {
    const scatter = planScatter(path);
    expect(scatter).toEqual(planScatter(path));
    expect(scatter.houses.filter((h) => h.shop).length).toBe(12); // town high street
  });

  it("buckets every item into exactly one tile", () => {
    const scatter = planScatter(path);
    const total = scatter.trees.length + scatter.houses.length + scatter.paddies.length;
    expect(total).toBeGreaterThan(600);
    let placed = 0;
    for (const part of bucketScatter(scatter, 250).values()) {
      placed += part.trees.length + part.houses.length + part.paddies.length;
    }
    expect(placed).toBe(total);
  });

  it("collider spans the yaw-rotated house footprint (minus the walk margin)", () => {
    const [c] = houseColliders([{ x: 0, y: 0, z: 0, w: 10, d: 2, h: 3, i: 0, yaw: Math.PI / 2 }]);
    expect(c.max.z - c.min.z).toBeCloseTo(10 - 0.7, 3);
    expect(c.max.x - c.min.x).toBeCloseTo(2 - 0.7, 3);
  });
});
