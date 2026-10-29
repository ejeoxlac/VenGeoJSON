import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const W = 800;
const H = 700;
const pad = 20;

function walk(coords, fn) {
  if (typeof coords[0] === "number") {
    fn(coords);
    return;
  }
  for (const c of coords) walk(c, fn);
}

function boundsFromFeatures(features) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of features) {
    walk(f.geometry.coordinates, ([lon, lat]) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
  }
  return { minLon, maxLon, minLat, maxLat };
}

function makeProjector(bounds) {
  const { minLon, maxLon, minLat, maxLat } = bounds;
  const px = (lon) => pad + ((lon - minLon) / (maxLon - minLon)) * (W - 2 * pad);
  const py = (lat) => pad + (1 - (lat - minLat) / (maxLat - minLat)) * (H - 2 * pad);
  return { px, py };
}

function ringToPath(ring, px, py) {
  return (
    ring
      .map((c, i) => `${i ? "L" : "M"}${px(c[0]).toFixed(2)},${py(c[1]).toFixed(2)}`)
      .join(" ") + " Z"
  );
}

function geomToPaths(g, px, py) {
  const paths = [];
  if (g.type === "Polygon") {
    for (const r of g.coordinates) paths.push(ringToPath(r, px, py));
  } else if (g.type === "MultiPolygon") {
    for (const p of g.coordinates) {
      for (const r of p) paths.push(ringToPath(r, px, py));
    }
  }
  return paths;
}

function writeSvg(outName, ariaLabel, features, styleForFeature) {
  const bounds = boundsFromFeatures(features);
  const { px, py } = makeProjector(bounds);
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ariaLabel}">
`;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const { fill, stroke, strokeWidth, attrs } = styleForFeature(f, i);
    const dataAttrs = attrs
      ? Object.entries(attrs)
          .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "")}"`)
          .join("")
      : "";
    for (const d of geomToPaths(f.geometry, px, py)) {
      svg += `  <path d="${d}" fill="${fill}" fill-opacity="0.88" stroke="${stroke}" stroke-width="${strokeWidth}"${dataAttrs}/>\n`;
    }
  }
  svg += "</svg>\n";
  const outDir = path.join(root, "assets");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, outName), svg);
  console.log(`Wrote assets/${outName} (${features.length} features)`);
}

const stateColors = [
  "#3d9e6f",
  "#4fb88a",
  "#2d7a56",
  "#5ec99a",
  "#368f65",
  "#45a878",
  "#52b58f",
  "#3a8f62",
];

function generateEstados() {
  const geo = JSON.parse(
    fs.readFileSync(path.join(root, "venezuela.geojson"), "utf8")
  );
  writeSvg("mapa-venezuela-estados.svg", "Mapa de Venezuela por estados", geo.features, (f, i) => ({
    fill: stateColors[i % stateColors.length],
    stroke: "#1a5c3e",
    strokeWidth: "0.6",
    attrs: { "data-estado": f.properties.ESTADO || "" },
  }));
}

function municipioFill(cod) {
  const n = parseInt(String(cod ?? "0"), 10) || 0;
  const h = (n * 47) % 360;
  return `hsl(${h}, 38%, 46%)`;
}

function loadMunicipioFeatures() {
  const dir = path.join(root, "Municipios");
  const features = [];
  for (let i = 1; i <= 24; i++) {
    const file = path.join(dir, `${String(i).padStart(2, "0")}.geojson`);
    if (!fs.existsSync(file)) {
      console.warn(`Skip missing ${file}`);
      continue;
    }
    const geo = JSON.parse(fs.readFileSync(file, "utf8"));
    if (geo.features?.length) features.push(...geo.features);
  }
  return features;
}

function generateMunicipios() {
  const features = loadMunicipioFeatures();
  if (!features.length) {
    console.warn("No municipio features found; skip mapa-venezuela-municipios.svg");
    return;
  }
  writeSvg(
    "mapa-venezuela-municipios.svg",
    "Mapa de Venezuela por municipios",
    features,
    (f) => ({
      fill: municipioFill(f.properties.COD_MUNICIPIO),
      stroke: "#1a3d2e",
      strokeWidth: "0.2",
      attrs: {
        "data-municipio": f.properties.MUNICIPIO || "",
        "data-cod": f.properties.COD_MUNICIPIO || "",
      },
    })
  );
}

generateEstados();
generateMunicipios();
