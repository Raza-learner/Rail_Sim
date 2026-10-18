export type Vec3 = { x: number; y: number; z: number };

export type RailNode = Vec3;

export type StationStop = {
  id: string;
  distance: number; // metres along route
  tolerance: number; // metres
};

export type Route = {
  name: string;
  nodes: RailNode[];
  speedLimits: { fromDistance: number; limitKmh: number }[];
  stations: StationStop[];
};

export type TrainControls = {
  powerNotch: number; // 0..1
  brake: number; // 0..1
  emergency: boolean;
  reverser: -1 | 0 | 1;
};

export type TrainState = {
  distance: number; // metres along route
  velocity: number; // m/s signed
};
