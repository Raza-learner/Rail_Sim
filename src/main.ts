import { buildRail, positionAt, tangentAt } from "./core/rail";
import { stepTrain, speedLimitAt } from "./core/train";
import { InputManager } from "./core/input";
import { createRender } from "./render/scene";
import { createHud } from "./ui/hud";
import { route } from "./world/routeData";
import { StationStopController } from "./core/stationStop";
import { signalsForRoute, aspectFor, nearestSignal } from "./core/signals";
import { createPlayer, updatePlayer } from "./core/player";
import type { AABB } from "./core/player";
import { buildRails, buildStations } from "./render/station";
import { buildTerrain, heightAt } from "./render/terrain";
import {
  buildStaticScenery,
  planScatter,
  bucketScatter,
  buildTileScenery,
  houseColliders,
} from "./render/scenery";
import { applyAnimeStyle, applyToon, addOutlines } from "./render/animestyle";
import { updateTrainDoors } from "./render/trainModel";
import { TileManager } from "./world/tiles";
import * as THREE from "three";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const path = buildRail(route.nodes);
const renderCtx = createRender(canvas, path);
const input = new InputManager();
const updateHud = createHud();
const stationCtrl = new StationStopController(route);
const signals = signalsForRoute(route);

buildTerrain(renderCtx.scene, path);
buildRails(renderCtx.scene, path);
buildStations(renderCtx.scene, path, route.stations, "yamabuki");
buildStaticScenery(renderCtx.scene, path);

// Scenery streams in tiles; the corridor itself (terrain, rails, platforms,
// catenary) stays loaded so the simulation never depends on view distance.
const tiles = new TileManager();
const buckets = bucketScatter(planScatter(path), tiles.tileSize);
const tileColliders = new Map<string, AABB[]>();
tiles.onTileLoad = (tile, group) => {
  const part = buckets.get(tile.key) ?? { trees: [], houses: [], paddies: [], flowers: [], grass: [] };
  group.add(buildTileScenery(part));
  applyToon(group);
  addOutlines(group);
  const colliders = houseColliders(part.houses);
  if (colliders.length > 0) tileColliders.set(tile.key, colliders);
};
tiles.onTileUnload = (tile) => tileColliders.delete(tile.key);

// platform colliders belong to the stations, which never stream
const platformColliders: AABB[] = [];
for (const st of route.stations) {
  platformColliders.push({ min: { x: -6, y: 0, z: st.distance - 4 }, max: { x: 6, y: 1.2, z: st.distance + 4 } });
}
function activeColliders(): AABB[] {
  const all: AABB[] = [...platformColliders];
  for (const list of tileColliders.values()) all.push(...list);
  return all;
}

// player mesh
const playerMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.35, 1.2, 4, 8),
  new THREE.MeshLambertMaterial({ color: 0xe53935 }),
);
playerMesh.visible = false;
renderCtx.scene.add(playerMesh);

applyAnimeStyle(renderCtx.scene);

let state = { distance: 0, velocity: 0 };
let doorT = 0; // smoothed 0..1 door animation
let mode: "drive" | "walk" = "drive";
const player = createPlayer({ x: 0, y: 0, z: 0 });
const FIXED_DT = 1 / 60;
let accumulator = 0;
let lastTime = performance.now();

function loop(now: number) {
  const frameDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += frameDt;
  input.update(frameDt);

  if (input.consumeCameraToggle()) {
    renderCtx.setCameraMode(renderCtx.cameraMode === "follow" ? "cab" : "follow");
  }

  if (input.consumeInteract()) {
    if (mode === "drive" && Math.abs(state.velocity) < 0.5) {
      const pos = positionAt(path, state.distance);
      player.position = { x: pos.x + 2, y: pos.y, z: pos.z };
      playerMesh.visible = true;
      mode = "walk";
    } else if (mode === "walk") {
      // re-enter if near the train
      const tpos = positionAt(path, state.distance);
      const d = Math.hypot(player.position.x - tpos.x, player.position.z - tpos.z);
      if (d < 4) {
        mode = "drive";
        playerMesh.visible = false;
      }
    }
  }

  if (mode === "drive") {
    while (accumulator >= FIXED_DT) {
      const ctrl = input.controls();
      state = stepTrain(state, ctrl, route, path, FIXED_DT);
      accumulator -= FIXED_DT;
    }
    const pos = positionAt(path, state.distance);
    const tan = tangentAt(path, state.distance);
    renderCtx.updateTrain(pos, tan, state.velocity, state.distance);
    tiles.update(pos, renderCtx.scene);

    const status = stationCtrl.update(state.distance, state.velocity, frameDt);
    doorT += ((status.doorsOpen ? 1 : 0) - doorT) * Math.min(1, frameDt * 3);
    updateTrainDoors(renderCtx.train, doorT);

    const sig = nearestSignal(signals, state.distance);
    const aspect = sig ? aspectFor(sig, state.distance) : "clear";
    const speedKmh = Math.abs(state.velocity) * 3.6;
    updateHud({
      speedKmh,
      speedLimitKmh: speedLimitAt(route, state.distance),
      power: input.powerNotch,
      brake: input.brake,
      signal: `${aspect}${status.doorsOpen ? " (doors)" : ""} [Drive]`,
    });
  } else {
    tiles.update(player.position, renderCtx.scene);
    updatePlayer(player, input.keys, activeColliders(), frameDt, heightAt(path, player.position.x, player.position.z));
    playerMesh.position.set(player.position.x, player.position.y + 0.9, player.position.z);
    // camera follow player
    const cam = renderCtx.camera;
    cam.position.lerp(new THREE.Vector3(player.position.x, player.position.y + 5, player.position.z + 8), 0.1);
    cam.lookAt(player.position.x, player.position.y + 1, player.position.z);
    updateHud({
      speedKmh: 0,
      speedLimitKmh: speedLimitAt(route, state.distance),
      power: 0,
      brake: 0,
      signal: `Walk (E near train to board)`,
    });
  }

  renderCtx.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
