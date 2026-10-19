import * as THREE from "three";

// Hard-edged anime cumulus: a cluster of circles drawn twice — pale blue
// undersides offset down behind a white top. No gradients, so the edge stays
// crisp like a painted cel.
function makeCloudTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const blobs: [number, number, number][] = [
    [62, 74, 24],
    [96, 58, 32],
    [134, 52, 36],
    [170, 62, 30],
    [196, 78, 20],
    [110, 80, 30],
    [152, 84, 26],
    [78, 88, 20],
  ];
  for (const [x, y, r] of blobs) {
    ctx.fillStyle = "#b9d4ee";
    ctx.beginPath();
    ctx.arc(x, y + 8, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [x, y, r] of blobs) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function addClouds(scene: THREE.Scene) {
  const tex = makeCloudTexture();
  const group = new THREE.Group();
  group.name = "clouds";
  let seed = 4242;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.92 }),
    );
    const w = 320 + rand() * 300;
    s.scale.set(w, w * 0.5, 1);
    s.position.set((rand() - 0.5) * 4200, 700 + rand() * 500, (rand() - 0.5) * 5200 + 1800);
    group.add(s);
  }
  scene.add(group);
}
