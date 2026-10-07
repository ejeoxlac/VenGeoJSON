import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const geo = JSON.parse(
  fs.readFileSync(path.join(root, "venezuela.geojson"), "utf8")
);

const W = 800;
const H = 700;
const pad = 20;
let minLon = Infinity;
let maxLon = -Infinity;
let minLat = Infinity;
let maxLat = -Infinity;

function walk(coords, fn) {
  if (typeof coords[0] === "number") {
    fn(coords);
    return;
  }
  for (const c of coords) walk(c, fn);
}

for (const f of geo.features) {
  walk(f.geometry.coordinates, ([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
}

const px = (lon) => pad + ((lon - minLon) / (maxLon - minLon)) * (W - 2 * pad);
const py = (lat) => pad + (1 - (lat - minLat) / (maxLat - minLat)) * (H - 2 * pad);

function ringToPath(ring) {
  return (
    ring
      .map((c, i) => `${i ? "L" : "M"}${px(c[0]).toFixed(2)},${py(c[1]).toFixed(2)}`)
      .join(" ") + " Z"
  );
}

function geomToPaths(g) {
  const paths = [];
  if (g.type === "Polygon") {
    for (const r of g.coordinates) paths.push(ringToPath(r));
  } else if (g.type === "MultiPolygon") {
    for (const p of g.coordinates) {
      for (const r of p) paths.push(ringToPath(r));
    }
  }
  return paths;
}

const colors = [
  "#3d9e6f",
  "#4fb88a",
  "#2d7a56",
  "#5ec99a",
  "#368f65",
  "#45a878",
  "#52b58f",
  "#3a8f62",
];

let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de Venezuela por estados">
`;

for (let i = 0; i < geo.features.length; i++) {
  const f = geo.features[i];
  const fill = colors[i % colors.length];
  const name = (f.properties.ESTADO || "").replace(/"/g, "");
  for (const d of geomToPaths(f.geometry)) {
    svg += `  <path d="${d}" fill="${fill}" fill-opacity="0.85" stroke="#1a5c3e" stroke-width="0.6" data-estado="${name}"/>\n`;
  }
}

svg += "</svg>\n";

const outDir = path.join(root, "assets");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "mapa-venezuela-estados.svg"), svg);
console.log("Wrote assets/mapa-venezuela-estados.svg");
