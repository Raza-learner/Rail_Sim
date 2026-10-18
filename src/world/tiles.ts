import * as THREE from "three";

export type Tile = { key: string; x: number; z: number; size: number };

export class TileManager {
  tileSize: number;
  loadRadius: number;
  unloadRadius: number;
  loaded = new Map<string, Tile>();
  onTileLoad: (tile: Tile, mesh: THREE.Mesh) => void = () => {};
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
        const d = Math.hypot(cx - pos.x, cz - pos.z);
        if (d <= this.loadRadius) wanted.add(this.keyFor(gx, gz));
      }
    }
    // load
    for (const k of wanted) {
      if (!this.loaded.has(k)) {
        const [gx, gz] = k.split(",").map(Number);
        const tile: Tile = { key: k, x: gx * this.tileSize, z: gz * this.tileSize, size: this.tileSize };
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(this.tileSize, this.tileSize),
          new THREE.MeshLambertMaterial({ color: 0x7c9a5e, transparent: true, opacity: 0.35 }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(tile.x + this.tileSize / 2, -0.01, tile.z + this.tileSize / 2);
        scene.add(mesh);
        (tile as any).mesh = mesh;
        this.loaded.set(k, tile);
      }
    }
    // unload
    for (const [k, tile] of this.loaded) {
      if (!wanted.has(k)) {
        const mesh = (tile as any).mesh as THREE.Mesh;
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.loaded.delete(k);
      }
    }
  }
}
