import type { Route } from "./types";

export type StopState =
  | "idle"
  | "approaching"
  | "braking"
  | "final"
  | "stopped"
  | "doorsOpen"
  | "dwell"
  | "ready";

export type StationStatus = {
  state: StopState;
  stationId: string | null;
  doorsOpen: boolean;
  canDepart: boolean;
  dwellRemaining: number;
};

const APPROACH_DISTANCE = 250; // m
const FINAL_SPEED = 5; // m/s? 5 m/s ~18km/h threshold
const DWELL_SECONDS = 4;

export class StationStopController {
  private route: Route;
  private currentIndex = 0;
  private state: StopState = "idle";
  private dwell = 0;
  private doorsOpen = false;

  constructor(route: Route) {
    this.route = route;
  }

  update(distance: number, velocity: number, dt: number): StationStatus {
    const station = this.route.stations[this.currentIndex];
    if (!station) {
      return { state: "idle", stationId: null, doorsOpen: false, canDepart: true, dwellRemaining: 0 };
    }
    const toStation = station.distance - distance;

    switch (this.state) {
      case "idle":
        if (toStation <= APPROACH_DISTANCE && toStation > 0) this.state = "approaching";
        break;
      case "approaching":
        if (toStation <= 80) this.state = "braking";
        else if (toStation <= 0) this.state = "final";
        break;
      case "braking":
        if (Math.abs(velocity) < FINAL_SPEED) this.state = "final";
        break;
      case "final":
        if (Math.abs(velocity) < 0.3 && Math.abs(toStation) < station.tolerance) {
          this.state = "stopped";
        }
        break;
      case "stopped":
        this.doorsOpen = true;
        this.state = "doorsOpen";
        this.dwell = DWELL_SECONDS;
        break;
      case "doorsOpen":
        this.dwell -= dt;
        if (this.dwell <= 0) {
          this.doorsOpen = false;
          this.state = "ready";
        }
        break;
      case "ready":
        // departure when power applied
        break;
      case "dwell":
        break;
    }

    // Advance on departure, or when the train blows through without stopping.
    const dwellDone = this.state !== "stopped" && this.state !== "doorsOpen";
    if (dwellDone && distance > station.distance + 5 && Math.abs(velocity) > 0.5) {
      this.currentIndex++;
      this.state = "idle";
      this.doorsOpen = false;
    }

    const canDepart = this.state === "ready" || this.state === "idle";
    return {
      stationId: station.id,
      state: this.state,
      doorsOpen: this.doorsOpen,
      canDepart,
      dwellRemaining: Math.max(0, this.dwell),
    };
  }

  // force doors (E key) toggle not implemented; auto
}
