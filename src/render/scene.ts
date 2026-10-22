import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Vec3 } from "../core/types";
import { createTrainModel, TRAIN_LENGTH, updateTrainWheels } from "./trainModel";
import { setOutlineResolution, SKY_HORIZON } from "./animestyle";
import { updateSway } from "./scenery";

export type CameraMode = "follow" | "cab";

export type RenderContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  train: THREE.Group;
  cameraMode: CameraMode;
  setCameraMode: (m: CameraMode) => void;
  updateTrain: (pos: Vec3, tangent: Vec3, velocity?: number) => void;
  render: () => void;
};

export function createRender(canvas: HTMLCanvasElement): RenderContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_HORIZON);
  // fog matches the sky horizon so distant terrain melts into the backdrop
  scene.fog = new THREE.Fog(SKY_HORIZON, 1600, 7000);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 8000);
  camera.position.set(0, 8, -15);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Two-light anime rig (sakura-crossing's): warm quantised key, a strong
  // cool fill from the opposite quarter that carries the shadow side (anime
  // shadows are coloured, not dark), a weak upward bounce for undersides,
  // and sky/violet-grey hemisphere so nothing ever goes black.
  const hemi = new THREE.HemisphereLight(0xc8e4f8, 0xa89bc0, 1.05);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffe8c4, 1.75);
  dir.position.set(60, 110, 30);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xa9bdf5, 0.8);
  fill.position.set(-65, 55, -35);
  scene.add(fill);
  const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.25);
  bounce.position.set(-15, -30, 50);
  scene.add(bounce);

  // Custom composer target: the scene render leaves a depth texture we ink
  // from. Both ping-pong buffers share one depth store (RenderPass draws into
  // readBuffer, so the clone's own depth would otherwise miss the scene).
  const pxr = renderer.getPixelRatio();
  const inkDepth = new THREE.DepthTexture(window.innerWidth * pxr, window.innerHeight * pxr);
  inkDepth.type = THREE.UnsignedIntType;
  // samples:4 = MSAA in the post chain — the renderer's `antialias` flag is
  // ignored when rendering through a composer target, so without this every
  // geometry edge (unlike the flat sky) renders pixel-hard aliased
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(window.innerWidth * pxr, window.innerHeight * pxr, {
      depthTexture: inkDepth,
      samples: 4,
    }),
  );
  composer.renderTarget2.depthTexture = composer.renderTarget1.depthTexture;
  composer.setSize(window.innerWidth, window.innerHeight);
  setOutlineResolution(window.innerWidth * pxr, window.innerHeight * pxr);
  const clock = new THREE.Clock();
  composer.addPass(new RenderPass(scene, camera));
  // Screen-space ink: second difference of linearised depth. Grazing flats
  // give ~0 so roads/fields stay clean; silhouettes and creases ink. Centre
  // closer than its neighbours = convex edge (strong); centre behind =
  // occlusion edge (faint). Colour-aware: the line takes the darker
  // neighbouring colour, not black. ?ink=0 turns it off for A/B checks.
  let ink: ShaderPass | null = null;
  if (new URLSearchParams(location.search).get("ink") !== "0") {
    ink = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: composer.renderTarget1.depthTexture },
        texel: { value: new THREE.Vector2(1 / (window.innerWidth * pxr), 1 / (window.innerHeight * pxr)) },
        nearP: { value: camera.near },
        farP: { value: camera.far },
        strength: { value: 0.45 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 texel;
        uniform float nearP;
        uniform float farP;
        uniform float strength;
        varying vec2 vUv;
        float lin(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return (nearP * farP) / (farP - d * (farP - nearP));
        }
        void main() {
          vec3 src = texture2D(tDiffuse, vUv).rgb;
          float l = lin(vUv - vec2(texel.x, 0.0));
          float r = lin(vUv + vec2(texel.x, 0.0));
          float b = lin(vUv - vec2(0.0, texel.y));
          float t = lin(vUv + vec2(0.0, texel.y));
          float c = lin(vUv);
          float rel = ((l + r + b + t) - 4.0 * c) / max(c, 1.0);
          float e = max(rel, 0.0) / 0.09 + max(-rel, 0.0) / 0.40;
          float ink = clamp(e, 0.0, 1.0) * strength * (1.0 - smoothstep(150.0, 500.0, c));
          vec3 lineCol = min(
            min(texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb, texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb),
            min(texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb, texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb)
          ) * 0.85;
          gl_FragColor = vec4(mix(src, lineCol, ink), 1.0);
        }`,
    });
    composer.addPass(ink);
  }
  // Kuwahara paint: 4-quadrant least-variance smoothing that keeps edges —
  // a light blend for the Ghibli wash: tight radius so the scene reads
  // painterly without smearing detail
  const paint = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      strength: { value: 0.16 },
      texel: { value: new THREE.Vector2(1 / (window.innerWidth * pxr), 1 / (window.innerHeight * pxr)) },
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
              vec2 o = vec2(float(i) + 0.5, float(j) + 0.5) * texel * 1.2;
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
  // Film grade: split-tone (violet-leaning darks, warm paper-white
  // highlights), lifted blacks so shadow never goes pure black, then the
  // existing vignette — the finishing pass over the painted image
  const grade = new ShaderPass({
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
        vec3 c = tex.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c *= mix(vec3(0.93, 0.86, 1.08), vec3(1.04, 1.0, 0.93), smoothstep(0.05, 0.85, l));
        c = c * 0.97 + vec3(0.030, 0.026, 0.048);
        float d = distance(vUv, vec2(0.5));
        float v = smoothstep(0.9, 0.35, d);
        gl_FragColor = vec4(c * mix(1.0 - strength, 1.0, v), tex.a);
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const train = createTrainModel();
  scene.add(train);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    // depth texture isn't resized by the composer — do it by hand
    const px = renderer.getPixelRatio();
    const dw = window.innerWidth * px;
    const dh = window.innerHeight * px;
    composer.renderTarget1.depthTexture!.image.width = dw;
    composer.renderTarget1.depthTexture!.image.height = dh;
    composer.renderTarget1.depthTexture!.needsUpdate = true;
    if (ink) {
      ink.uniforms.texel.value.set(1 / dw, 1 / dh);
    }
    setOutlineResolution(dw, dh);
    paint.uniforms.texel.value.set(
      1 / (window.innerWidth * renderer.getPixelRatio()),
      1 / (window.innerHeight * renderer.getPixelRatio()),
    );
  });

  const renderState = { cameraMode: "follow" as CameraMode };

  function setCameraMode(m: CameraMode) {
    renderState.cameraMode = m;
  }

  let lastWheelT = 0;
  function updateTrain(pos: Vec3, tangent: Vec3, velocity = 0) {
    const now = clock.getElapsedTime();
    const wdt = Math.max(0, Math.min(0.1, now - lastWheelT));
    lastWheelT = now;
    updateTrainWheels(train, velocity, wdt);
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
