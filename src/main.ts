import { buildRail, positionAt, tangentAt } from "./core/rail";
import { stepTrain, speedLimitAt } from "./core/train";
import { InputManager } from "./core/input";
import { createRender } from "./render/scene";
import { createHud } from "./ui/hud";
import { route } from "./world/routeData";
import * as THREE from "three";

const canvas = document.querySelector<HTMLCanvasElement>("#app")!;
const renderCtx = createRender(canvas);
const input = new InputManager();
const updateHud = createHud();

const path = buildRail(route.nodes);

// track visual
const trackPoints = route.nodes.map((n) => new THREE.Vector3(n.x, n.y, n.z));
const trackGeo = new THREE.BufferGeometry().setFromPoints(trackPoints);
const trackLine = new THREE.Line(trackGeo, new THREE.LineBasicMaterial({ color: 0x333333 }));
renderCtx.scene.add(trackLine);

let state = { distance: 0, velocity: 0 };
const FIXED_DT = 1 / 60;
let accumulator = 0;
let lastTime = performance.now();

function loop(now: number) {
  const frameDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  accumulator += frameDt;
  input.update(frameDt);

  while (accumulator >= FIXED_DT) {
    const ctrl = input.controls();
    state = stepTrain(state, ctrl, route, path, FIXED_DT);
    accumulator -= FIXED_DT;
  }

  const pos = positionAt(path, state.distance);
  const tan = tangentAt(path, state.distance);
  renderCtx.updateTrain(pos, tan);

  const speedKmh = Math.abs(state.velocity) * 3.6;
  updateHud({
    speedKmh,
    speedLimitKmh: speedLimitAt(route, state.distance),
    power: input.powerNotch,
    brake: input.brake,
    signal: "Clear",
  });

  renderCtx.renderer.render(renderCtx.scene, renderCtx.camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
