import * as THREE from "three";

export type Tile = {
  key: string;
  gx: number;
  gz: number;
  x: number;
  z: number;
  size: number;
  group: THREE.Group;
};

export class TileManager {
  tileSize: number;
  loadRadius: number;
  unloadRadius: number;
  loaded = new Map<string, Tile>();
  onTileLoad: (tile: Tile, group: THREE.Group) => void = () => {};
  onTileUnload: (tile: Tile) => void = () => {};

  constructor(tileSize = 250, loadRadius = 400, unloadRadius = 800) {
    this.tileSize = tileSize;
    this.loadRadius = loadRadius;
    this.unloadRadius = unloadRadius;
  }

  keyFor(gx: number, gz: number) { return `${gx},${gz}`; }

  update(pos: { x: number; z: number }, scene: THREE.Scene) {
    const gx0 = Math.floor(pos.x / this.tileSize);
    const gz0 = Math.floor(pos.z / this.tileSize);
    const range = Math.ceil(this.loadRadius / this.tileSize);
    const wanted = new Set<string>();
    for (let dx = -range; dx <= range; dx++) {
      for (let dz = -range; dz <= range; dz++) {
        const gx = gx0 + dx, gz = gz0 + dz;
        const cx = gx * this.tileSize + this.tileSize / 2;
        const cz = gz * this.tileSize + this.tileSize / 2;
        if (Math.hypot(cx - pos.x, cz - pos.z) <= this.loadRadius) wanted.add(this.keyFor(gx, gz));
      }
    }
    // load
    for (const k of wanted) {
      if (this.loaded.has(k)) continue;
      const [gx, gz] = k.split(",").map(Number);
      const tile: Tile = { key: k, gx, gz, x: gx * this.tileSize, z: gz * this.tileSize, size: this.tileSize, group: new THREE.Group() };
      tile.group.name = `tile-${k}`;
      this.onTileLoad(tile, tile.group);
      scene.add(tile.group);
      this.loaded.set(k, tile);
    }
    // unload, with hysteresis: tiles stay inside unloadRadius so boundary
    // crossing does not thrash load/unload every frame
    for (const [k, tile] of this.loaded) {
      if (wanted.has(k)) continue;
      const cx = tile.gx * this.tileSize + this.tileSize / 2;
      const cz = tile.gz * this.tileSize + this.tileSize / 2;
      if (Math.hypot(cx - pos.x, cz - pos.z) <= this.unloadRadius) continue;
      scene.remove(tile.group);
      disposeGroup(tile.group);
      this.loaded.delete(k);
      this.onTileUnload(tile);
    }
  }
}

// Outline meshes share geometry with (and inherit material from) their source
// mesh, so skip them — the source mesh owns disposal.
export function disposeGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.outline) return;
    mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat.dispose();
  });
}
