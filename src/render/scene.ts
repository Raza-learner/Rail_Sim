import * as THREE from "three";
import type { Vec3 } from "../core/types";

export type CameraMode = "follow" | "cab";

export type RenderContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  train: THREE.Group;
  cameraMode: CameraMode;
  setCameraMode: (m: CameraMode) => void;
  updateTrain: (pos: Vec3, tangent: Vec3) => void;
};

export function createRender(canvas: HTMLCanvasElement): RenderContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 8, -15);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(50, 100, 50);
  scene.add(dir);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshLambertMaterial({ color: 0x6b8e23 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const train = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2.5, 12),
    new THREE.MeshLambertMaterial({ color: 0x1e88e5 }),
  );
  body.position.y = 1.25;
  train.add(body);
  scene.add(train);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const renderState = { cameraMode: "follow" as CameraMode };

  function setCameraMode(m: CameraMode) {
    renderState.cameraMode = m;
  }

  function updateTrain(pos: Vec3, tangent: Vec3) {
    train.position.set(pos.x, pos.y, pos.z);
    if (tangent.x !== 0 || tangent.z !== 0) {
      train.rotation.y = Math.atan2(tangent.x, tangent.z);
    }
    if (renderState.cameraMode === "follow") {
      const camOffset = new THREE.Vector3(-tangent.x * 12, 6, -tangent.z * 12);
      camera.position.lerp(new THREE.Vector3(pos.x + camOffset.x, pos.y + camOffset.y, pos.z + camOffset.z), 0.1);
      camera.lookAt(pos.x, pos.y + 1, pos.z);
    } else {
      // cab: front of train
      const fwd = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
      camera.position.lerp(new THREE.Vector3(pos.x + fwd.x * 4, pos.y + 2.2, pos.z + fwd.z * 4), 0.3);
      camera.lookAt(pos.x + fwd.x * 30, pos.y + 1, pos.z + fwd.z * 30);
    }
  }

  return { scene, camera, renderer, train, get cameraMode() { return renderState.cameraMode; }, setCameraMode, updateTrain };
}
