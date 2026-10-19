import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { TileManager } from "./tiles";

describe("TileManager", () => {
  it("loads tiles in radius and keeps them inside the unload radius", () => {
    const tiles = new TileManager(100, 100, 200);
    const loaded: string[] = [];
    const unloaded: string[] = [];
    const box = new THREE.BoxGeometry(1, 1, 1);
    tiles.onTileLoad = (tile, group) => {
      loaded.push(tile.key);
      group.add(new THREE.Mesh(box));
    };
    tiles.onTileUnload = (tile) => unloaded.push(tile.key);
    const scene = new THREE.Scene();

    tiles.update({ x: 0, z: 0 }, scene);
    const first = loaded.length;
    expect(first).toBeGreaterThan(0);
    expect(scene.children.length).toBe(first);

    // small move: nothing loads or unloads
    tiles.update({ x: 5, z: 5 }, scene);
    expect(loaded.length).toBe(first);
    expect(unloaded.length).toBe(0);

    // step to the next tile ring: new tiles load, old ones are kept by
    // hysteresis even where they fall outside the load radius
    tiles.update({ x: 100, z: 0 }, scene);
    expect(loaded.length).toBeGreaterThan(first);
    expect(unloaded.length).toBe(0);

    // far outside the unload radius: everything old is released
    tiles.update({ x: 900, z: 0 }, scene);
    expect(unloaded.length).toBe(loaded.length - tiles.loaded.size);
    expect(scene.children.length).toBe(tiles.loaded.size);
  });
});
