import type { Route } from "../core/types";

export const routeNodes = [
  { x: 0, y: 0, z: 0 },
  { x: 20, y: 0.5, z: 200 },
  { x: 50, y: 1.0, z: 450 },
  { x: 60, y: 1.5, z: 700 },
  { x: 40, y: 2.0, z: 950 },
  { x: 10, y: 2.5, z: 1200 },
  { x: 0, y: 3.0, z: 1400 },
  { x: -10, y: 2.5, z: 1600 },
  { x: 0, y: 2.0, z: 1850 },
  { x: 30, y: 1.5, z: 2100 },
  { x: 60, y: 1.0, z: 2350 },
  { x: 80, y: 0.5, z: 2600 },
  { x: 60, y: 1.0, z: 2850 },
  { x: 20, y: 1.5, z: 3100 },
  { x: 0, y: 2.0, z: 3400 },
  { x: 0, y: 2.0, z: 3600 },
];

export const route: Route = {
  name: "Hinode – Yamabuki",
  nodes: routeNodes,
  speedLimits: [
    { fromDistance: 0, limitKmh: 40 },
    { fromDistance: 201, limitKmh: 60 },
    { fromDistance: 456, limitKmh: 80 },
    { fromDistance: 1231, limitKmh: 60 },
    { fromDistance: 1653, limitKmh: 80 },
    { fromDistance: 1908, limitKmh: 60 },
    { fromDistance: 2164, limitKmh: 80 },
    { fromDistance: 2420, limitKmh: 50 },
    { fromDistance: 2676, limitKmh: 80 },
    { fromDistance: 3192, limitKmh: 60 },
    { fromDistance: 3497, limitKmh: 40 },
  ],
  stations: [
    { id: "hinode", distance: 0, tolerance: 3 },
    { id: "kawakami", distance: 1908, tolerance: 3 },
    { id: "yamabuki", distance: 3500, tolerance: 3 },
  ],
};
