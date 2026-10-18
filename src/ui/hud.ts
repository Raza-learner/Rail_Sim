export type HudData = {
  speedKmh: number;
  speedLimitKmh: number;
  power: number;
  brake: number;
  signal: string;
};

export function createHud(): (d: HudData) => void {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;top:12px;left:12px;color:#fff;font-family:monospace;font-size:14px;background:rgba(0,0,0,0.5);padding:8px 12px;border-radius:6px;z-index:10;";
  document.body.appendChild(root);
  return (d) => {
    root.innerHTML = [
      `Speed: ${d.speedKmh.toFixed(0)} km/h`,
      `Limit: ${d.speedLimitKmh} km/h`,
      `Power: ${(d.power * 100).toFixed(0)}%`,
      `Brake: ${(d.brake * 100).toFixed(0)}%`,
      `Signal: ${d.signal}`,
    ].join("<br>");
  };
}
