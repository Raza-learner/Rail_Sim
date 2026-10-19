import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Vec3 } from "../core/types";
import { createTrainModel, TRAIN_LENGTH } from "./trainModel";

export type CameraMode = "follow" | "cab";

export type RenderContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  train: THREE.Group;
  cameraMode: CameraMode;
  setCameraMode: (m: CameraMode) => void;
  updateTrain: (pos: Vec3, tangent: Vec3) => void;
  render: () => void;
};

export function createRender(canvas: HTMLCanvasElement): RenderContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeff6fb);
  scene.fog = new THREE.Fog(0xeff6fb, 1400, 4400);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 8000);
  camera.position.set(0, 8, -15);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Saturated ambient: sky-blue from above, ground bounce from below, so
  // shadow side of objects takes colour instead of greying out.
  const hemi = new THREE.HemisphereLight(0xa8d3ff, 0x7f9e5a, 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff0d8, 1.35);
  dir.position.set(50, 100, 50);
  scene.add(dir);

  const composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.08,
    0.7,
    0.95,
  );
  composer.addPass(bloom);
  const vignette = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, strength: { value: 0.12 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(tDiffuse, vUv);
        float d = distance(vUv, vec2(0.5));
        float v = smoothstep(0.9, 0.35, d);
        gl_FragColor = vec4(tex.rgb * mix(1.0 - strength, 1.0, v), tex.a);
      }`,
  });
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  const train = createTrainModel();
  scene.add(train);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  const renderState = { cameraMode: "follow" as CameraMode };

  function setCameraMode(m: CameraMode) {
    renderState.cameraMode = m;
  }

  function updateTrain(pos: Vec3, tangent: Vec3) {
    train.position.set(pos.x, pos.y + 0.22, pos.z);
    if (tangent.x !== 0 || tangent.z !== 0) {
      train.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
    const back = TRAIN_LENGTH + 26;
    const rx = tangent.z / (Math.hypot(tangent.x, tangent.z) || 1);
    const rz = -tangent.x / (Math.hypot(tangent.x, tangent.z) || 1);
    if (renderState.cameraMode === "follow") {
      camera.position.lerp(
        new THREE.Vector3(pos.x - tangent.x * back + rx * 9, pos.y + 9, pos.z - tangent.z * back + rz * 9),
        0.1,
      );
      camera.lookAt(pos.x - tangent.x * (TRAIN_LENGTH * 0.4), pos.y + 2.5, pos.z - tangent.z * (TRAIN_LENGTH * 0.4));
    } else {
      // cab: just ahead of the nose so the camera is outside the train shell
      camera.position.lerp(
        new THREE.Vector3(pos.x + tangent.x * 2.5, pos.y + 3.5, pos.z + tangent.z * 2.5),
        0.3,
      );
      camera.lookAt(pos.x + tangent.x * 60, pos.y + 3.2, pos.z + tangent.z * 60);
    }
  }

  function render() {
    const sky = scene.getObjectByName("sky");
    if (sky) sky.position.copy(camera.position);
    composer.render();
  }

  return { scene, camera, renderer, train, get cameraMode() { return renderState.cameraMode; }, setCameraMode, updateTrain, render };
}
