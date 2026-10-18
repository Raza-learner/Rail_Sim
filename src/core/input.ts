import type { TrainControls } from "../core/types";

export class InputManager {
  keys = new Set<string>();
  powerNotch = 0;
  brake = 0;
  reverser: -1 | 0 | 1 = 1;
  emergency = false;
  cameraToggle = false;
  interact = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "KeyB") this.emergency = true;
      if (e.code === "KeyR") this.reverser = 1;
      if (e.code === "KeyF") this.reverser = -1;
      if (e.code === "KeyC") this.cameraToggle = true;
      if (e.code === "KeyE") this.interact = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyB") this.emergency = false;
    });
  }

  update(dt: number) {
    // gradual notches
    const up = this.keys.has("KeyW") || this.keys.has("ArrowUp");
    const down = this.keys.has("KeyS") || this.keys.has("ArrowDown");
    const target = up ? 1 : down ? 0 : this.powerNotch;
    this.powerNotch += (target - this.powerNotch) * Math.min(1, dt * 4);

    const braking = this.keys.has("Space");
    this.brake += ((braking ? 1 : 0) - this.brake) * Math.min(1, dt * 6);
  }

  controls(): TrainControls {
    return {
      powerNotch: this.powerNotch,
      brake: this.brake,
      emergency: this.emergency,
      reverser: this.reverser,
    };
  }

  consumeCameraToggle(): boolean {
    const v = this.cameraToggle;
    this.cameraToggle = false;
    return v;
  }

  consumeInteract(): boolean {
    const v = this.interact;
    this.interact = false;
    return v;
  }
}
