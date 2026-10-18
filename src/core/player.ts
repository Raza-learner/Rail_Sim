import type { Vec3 } from "./types";

export type AABB = { min: Vec3; max: Vec3 };

export type PlayerState = {
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
};

export function createPlayer(pos: Vec3): PlayerState {
  return { position: { ...pos }, velocity: { x: 0, y: 0, z: 0 }, onGround: false };
}

const GRAVITY = -18;
const WALK_SPEED = 5;


export function updatePlayer(p: PlayerState, keys: Set<string>, colliders: AABB[], dt: number) {
  const fwd = keys.has("KeyW") ? 1 : keys.has("KeyS") ? -1 : 0;
  const strafe = keys.has("KeyD") ? 1 : keys.has("KeyA") ? -1 : 0;
  // movement in world X/Z (no camera-relative for simplicity)
  p.velocity.x = strafe * WALK_SPEED;
  p.velocity.z = -fwd * WALK_SPEED;
  p.velocity.y += GRAVITY * dt;

  // integrate + collide per axis
  // X
  p.position.x += p.velocity.x * dt;
  for (const c of colliders) {
    if (insideXZ(p.position, c)) {
      if (p.velocity.x > 0) p.position.x = c.min.x - 0.4;
      else if (p.velocity.x < 0) p.position.x = c.max.x + 0.4;
      p.velocity.x = 0;
    }
  }
  // Z
  p.position.z += p.velocity.z * dt;
  for (const c of colliders) {
    if (insideXZ(p.position, c)) {
      if (p.velocity.z > 0) p.position.z = c.min.z - 0.4;
      else if (p.velocity.z < 0) p.position.z = c.max.z + 0.4;
      p.velocity.z = 0;
    }
  }
  // Y
  p.position.y += p.velocity.y * dt;
  p.onGround = false;
  for (const c of colliders) {
    if (insideXZ(p.position, c) && p.position.y >= c.min.y && p.position.y <= c.max.y + 0.1) {
      if (p.velocity.y < 0) {
        p.position.y = c.max.y;
        p.velocity.y = 0;
        p.onGround = true;
      }
    }
  }
  if (p.position.y < 0) { p.position.y = 0; p.velocity.y = 0; p.onGround = true; }
}

function insideXZ(p: Vec3, c: AABB) {
  return p.x > c.min.x && p.x < c.max.x && p.z > c.min.z && p.z < c.max.z;
}
