import { describe, it, expect } from "vitest";
import { createPlayer, updatePlayer } from "./player";

describe("player", () => {
  it("gravity pulls down", () => {
    const p = createPlayer({ x: 0, y: 5, z: 0 });
    updatePlayer(p, new Set(), [], 0.1);
    expect(p.position.y).toBeLessThan(5);
  });
  it("walks on key", () => {
    const p = createPlayer({ x: 0, y: 0, z: 0 });
    updatePlayer(p, new Set(["KeyW"]), [], 0.1);
    expect(p.position.z).not.toBe(0);
  });
});
