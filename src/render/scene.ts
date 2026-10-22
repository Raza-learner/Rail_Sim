import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Vec3 } from "../core/types";
import { createTrainModel, TRAIN_LENGTH } from "./trainModel";
import { updateSway } from "./scenery";

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
  scene.background = new THREE.Color(0xe9f3f8);
  // fog matches the sky horizon so distant terrain melts into the backdrop
  scene.fog = new THREE.Fog(0xe9f3f8, 1600, 7000);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 8000);
  camera.position.set(0, 8, -15);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Saturated ambient: sky-blue from above, warm ground bounce from below, so
  // the shadow side of objects takes colour instead of greying out.
  const hemi = new THREE.HemisphereLight(0xa9d2ff, 0x8fae5e, 1.15);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffe8c4, 1.6);
  dir.position.set(60, 110, 30);
  scene.add(dir);

  const composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);
  const clock = new THREE.Clock();
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.08,
    0.7,
    0.95,
  );
  composer.addPass(bloom);
  // Kuwahara paint: 4-quadrant least-variance smoothing that keeps edges —
  // a light radius-2 blend for the Ghibli wash without mushing detail
  const pr = renderer.getPixelRatio();
  const paint = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      strength: { value: 0.55 },
      texel: { value: new THREE.Vector2(1 / (window.innerWidth * pr), 1 / (window.innerHeight * pr)) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float strength;
      uniform vec2 texel;
      varying vec2 vUv;
      float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        float best = 1e9;
        vec3 col = src.rgb;
        for (int q = 0; q < 4; q++) {
          vec3 acc = vec3(0.0);
          float al = 0.0;
          float al2 = 0.0;
          for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
              vec2 o = vec2(float(i) + 0.5, float(j) + 0.5) * texel * 2.0;
              if (q == 1 || q == 3) o.x = -o.x;
              if (q == 2 || q == 3) o.y = -o.y;
              vec3 c = texture2D(tDiffuse, vUv + o).rgb;
              float l = lum(c);
              acc += c;
              al += l;
              al2 += l * l;
            }
          }
          float m = al / 9.0;
          float var = max(al2 / 9.0 - m * m, 0.0);
          if (var < best) { best = var; col = acc / 9.0; }
        }
        gl_FragColor = vec4(mix(src.rgb, col, strength), src.a);
      }`,
  });
  composer.addPass(paint);
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
    paint.uniforms.texel.value.set(
      1 / (window.innerWidth * renderer.getPixelRatio()),
      1 / (window.innerHeight * renderer.getPixelRatio()),
    );
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
    const t = clock.getElapsedTime();
    updateSway(t); // wind in the grass and flowers
    const sky = scene.getObjectByName("sky");
    if (sky) sky.position.copy(camera.position);
    const birds = scene.getObjectByName("birds");
    if (birds) birds.rotation.y += 0.0006; // slow orbital drift overhead
    const petals = scene.getObjectByName("petals");
    if (petals) {
      for (const p of petals.children) {
        const d = p.userData as {
          baseX: number; baseY: number; phase: number; range: number;
          speed: number; freq: number; amp: number;
        };
        p.position.y = d.baseY - ((t * d.speed + d.phase) % d.range);
        p.position.x = d.baseX + Math.sin(t * 0.7 + d.freq) * d.amp;
      }
    }
    composer.render();
  }

  return { scene, camera, renderer, train, get cameraMode() { return renderState.cameraMode; }, setCameraMode, updateTrain, render };
}
