import * as THREE from "three";

// Flat-edged anime cumulus circle cluster, drawn white over a pale blue
// underside offset down — no gradients, so edges stay crisp like a cel.
function makeCumulusTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const blobs: [number, number, number][] = [
    [52, 78, 24],
    [84, 56, 34],
    [124, 46, 40],
    [162, 54, 36],
    [198, 70, 26],
    [226, 84, 16],
    [104, 82, 32],
    [148, 84, 28],
    [70, 92, 20],
  ];
  for (const [x, y, r] of blobs) {
    ctx.fillStyle = "#b9d4ea";
    ctx.beginPath();
    ctx.arc(x, y + 9, r, 0, Math.PI * 2);
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

// Thin horizontal streak for cirrus — stretched and barely visible.
function makeCirrusTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.75;
  for (const [x, y, w, h] of [
    [40, 26, 110, 10],
    [90, 40, 130, 8],
    [30, 14, 70, 7],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Tiny distant bird: two dark arcs, reads as a "<" silhouette in the sky.
function makeBirdTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#2c3644";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.quadraticCurveTo(18, 2, 31, 12);
  ctx.quadraticCurveTo(44, 2, 56, 10);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Sakura petal: soft pink rounded blob, brighter at the top.
function makePetalTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f5b8cf";
  ctx.beginPath();
  ctx.ellipse(24, 26, 12, 15, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fcdce8";
  ctx.beginPath();
  ctx.ellipse(22, 22, 8, 9, 0.5, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Slow-falling petal field along the corridor. Each sprite stores its own
// drift parameters; scene.render() advances the fall + sway every frame.
export function addPetals(scene: THREE.Scene) {
  const tex = makePetalTexture();
  const group = new THREE.Group();
  group.name = "petals";
  let seed = 777777;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 42; i++) {
    const petal = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    const s = 0.6 + rand() * 0.8;
    petal.scale.set(s, s, 1);
    petal.userData = {
      baseX: (rand() - 0.5) * 90 + 30,
      baseY: 2 + rand() * 7,
      phase: rand() * 7,
      range: 7 + rand() * 4,
      speed: 0.5 + rand() * 0.8,
      freq: rand() * 6.28,
      amp: 1.5 + rand() * 3.5,
    };
    petal.position.set(petal.userData.baseX, petal.userData.baseY, rand() * 3600);
    group.add(petal);
  }
  scene.add(group);
}

// One towering summer cumulonimbus: stacked sprite layers, each smaller than
// the one below and offset sideways, so a flat billboard cluster reads as a
// massive blooming tower like the reference skies.
function buildTower(
  group: THREE.Group,
  tex: THREE.Texture,
  x: number,
  y: number,
  z: number,
  width: number,
  seedRand: () => number,
): void {
  const layers = 3 + Math.floor(seedRand() * 4);
  for (let L = 0; L < layers; L++) {
    const shrink = 1 - L * 0.13;
    const sway = (seedRand() - 0.5) * 0.22;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.96,
      }),
    );
    const w = width * shrink;
    sprite.scale.set(w, w * 0.62, 1);
    sprite.position.set(
      x + sway * width,
      y + L * width * 0.24,
      z + (seedRand() - 0.5) * width * 0.18,
    );
    group.add(sprite);
    // a shoulder cloud beside the tower base for the huge base mass
    if (L === 0) {
      const side = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.96 }),
      );
      const sw = width * 0.6;
      side.scale.set(sw, sw * 0.55, 1);
      const dir = seedRand() > 0.5 ? 1 : -1;
      side.position.set(x + dir * width * 0.62, y + width * 0.1, z + (seedRand() - 0.5) * width * 0.3);
      group.add(side);
    }
  }
}

export function addClouds(scene: THREE.Scene) {
  const cumulus = makeCumulusTexture();
  const cirrus = makeCirrusTexture();
  addPetals(scene);
  const sky = new THREE.Group();
  sky.name = "clouds";
  let seed = 4242;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // towers: bigger in front-left like reference 1, spread around the world
  const towerSpots: [number, number, number, number][] = [
    [-1250, 620, 2900, 700],
    [-1900, 700, 1700, 820],
    [-700, 560, 2400, 560],
    [900, 640, 3200, 640],
    [1500, 760, 2200, 740],
    [1950, 700, 1000, 600],
    [-1500, 780, 700, 680],
    [1100, 900, 1400, 560],
    [-500, 840, 520, 500],
  ];
  for (const [x, y, z, w] of towerSpots) {
    buildTower(sky, cumulus, x, y, z, w, rand);
  }

  // high wispy cirrus
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: cirrus, transparent: true, depthWrite: false, fog: false, opacity: 0.5 }),
    );
    const w = 800 + rand() * 700;
    s.scale.set(w, w * 0.16, 1);
    s.position.set((rand() - 0.5) * 4200, 950 + rand() * 600, (rand() - 0.5) * 5200 + 1800);
    sky.add(s);
  }

  // drifting birds on a ring around the world centre; scene.render() spins it
  const birds = new THREE.Group();
  birds.name = "birds";
  const birdTex = makeBirdTexture();
  for (let i = 0; i < 10; i++) {
    const bird = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: birdTex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }),
    );
    const s = 10 + rand() * 8;
    bird.scale.set(s, s * 0.5, 1);
    const a = rand() * Math.PI * 2;
    const r = 500 + rand() * 1400;
    birds.position.set(0, 0, 1800);
    bird.position.set(Math.cos(a) * r, 420 + rand() * 420, 1800 + Math.sin(a) * r);
    birds.add(bird);
  }

  scene.add(sky);
  scene.add(birds);
}
