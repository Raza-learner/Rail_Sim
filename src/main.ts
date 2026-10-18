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
import { TileManager } from "./world/tiles";
import * as THREE from "three";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const renderCtx = createRender(canvas);
const input = new InputManager();
const updateHud = createHud();

const path = buildRail(route.nodes);
const stationCtrl = new StationStopController(route);
const signals = signalsForRoute(route);
const tiles = new TileManager(250, 400, 800);

const trackPoints = route.nodes.map((n) => new THREE.Vector3(n.x, n.y, n.z));
const trackGeo = new THREE.BufferGeometry().setFromPoints(trackPoints);
const trackLine = new THREE.Line(trackGeo, new THREE.LineBasicMaterial({ color: 0x333333 }));
renderCtx.scene.add(trackLine);

// colliders
const colliders: AABB[] = [];
for (const st of route.stations) {
  colliders.push({ min: { x: -6, y: 0, z: st.distance - 4 }, max: { x: 6, y: 1.2, z: st.distance + 4 } });
}
// town blockout near Yamabuki
colliders.push({ min: { x: 10, y: 0, z: 3480 }, max: { x: 20, y: 4, z: 3500 } });
colliders.push({ min: { x: -20, y: 0, z: 3520 }, max: { x: -10, y: 4, z: 3540 } });

// player mesh
const playerMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.35, 1.2, 4, 8),
  new THREE.MeshLambertMaterial({ color: 0xe53935 }),
);
playerMesh.visible = false;
renderCtx.scene.add(playerMesh);

let state = { distance: 0, velocity: 0 };
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
      // re-enter if near train
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
    const status = stationCtrl.update(state.distance, state.velocity, frameDt);
    const pos = positionAt(path, state.distance);
    const tan = tangentAt(path, state.distance);
    renderCtx.updateTrain(pos, tan);
    tiles.update(pos, renderCtx.scene);

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
    updatePlayer(player, input.keys, colliders, frameDt);
    playerMesh.position.set(player.position.x, player.position.y + 0.9, player.position.z);
    // camera follow player
    const cam = renderCtx.camera;
    cam.position.lerp(new THREE.Vector3(player.position.x, player.position.y + 5, player.position.z + 8), 0.1);
    cam.lookAt(player.position.x, player.position.y + 1, player.position.z);
    tiles.update(player.position, renderCtx.scene);
    updateHud({
      speedKmh: 0,
      speedLimitKmh: speedLimitAt(route, state.distance),
      power: 0,
      brake: 0,
      signal: `Walk (E near train to board)`,
    });
  }

  renderCtx.renderer.render(renderCtx.scene, renderCtx.camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
