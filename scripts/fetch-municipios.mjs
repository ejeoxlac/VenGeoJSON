import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ESTADO24_LEGACY, LEGACY_PATHS, legacyMunicipio24Path } from "./legacy-dir.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "Municipios");

const SOURCE =
  "https://gis.unocha.org/server/rest/services/ven_admbnda_adm2_ine_20210223/MapServer/0/query" +
  "?where=1%3D1" +
  "&outFields=admin1Name_es,admin1Pcode,admin2Name_es,admin2Pcode" +
  "&returnGeometry=true&outSR=4326&orderByFields=admin2Pcode&f=geojson";

function stateNames() {
  const names = new Map();
  const dir = path.join(root, "Estados");
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith(".geojson")) continue;
    const filePath = path.join(dir, file.name);
    const geo = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const props = geo.features[0]?.properties;
    if (!props?.COD_ESTADO) continue;
    names.set(props.COD_ESTADO, props.ESTADO);
  }
  return names;
}

function bboxOf(geometry) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(geometry.coordinates);
  return { minLon, maxLon, minLat, maxLat };
}

function overlaps(a, b) {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

const estados = stateNames();
const stateBbox = new Map();
for (const [code] of estados) {
  const geo = JSON.parse(
    fs.readFileSync(path.join(root, "Estados", `${code}.geojson`), "utf8")
  );
  stateBbox.set(code, bboxOf(geo.features[0].geometry));
}

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`OCHA respondió ${response.status} ${response.statusText}`);
}
const collection = await response.json();
if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
  throw new Error("La respuesta no es un FeatureCollection");
}

const byState = new Map();
for (const feature of collection.features) {
  const pcode = feature.properties?.admin1Pcode || "";
  const mcode = feature.properties?.admin2Pcode || "";
  const code = pcode.replace(/^VE/, "");
  const munCode = mcode.replace(/^VE/, "");
  if (!/^\d{2}$/.test(code) || !estados.has(code)) {
    throw new Error(`Estado no reconocido: ${pcode}`);
  }
  if (!munCode.startsWith(code)) {
    throw new Error(`Código de municipio ${mcode} no pertenece al estado ${code}`);
  }
  const name = (feature.properties.admin2Name_es || "").trim();
  if (!name) throw new Error(`Municipio sin nombre: ${mcode}`);
  if (!overlaps(bboxOf(feature.geometry), stateBbox.get(code))) {
    throw new Error(`${name} (${mcode}) no se solapa con el estado ${code}`);
  }

  const next = {
    type: "Feature",
    properties: {
      COD_ESTADO: code,
      ESTADO: estados.get(code),
      COD_MUNICIPIO: munCode,
      MUNICIPIO: name.toLocaleUpperCase("es"),
    },
    geometry: feature.geometry,
  };
  if (!byState.has(code)) byState.set(code, []);
  byState.get(code).push(next);
}

fs.mkdirSync(outDir, { recursive: true });
let total = 0;
const codes = [...estados.keys()].sort();
for (const code of codes) {
  const features = (byState.get(code) || []).sort((a, b) =>
    a.properties.COD_MUNICIPIO.localeCompare(b.properties.COD_MUNICIPIO)
  );
  if (features.length === 0) {
    throw new Error(`El estado ${code} no tiene municipios`);
  }
  const fc = { type: "FeatureCollection", features };
  const file = path.join(outDir, `${code}.geojson`);
  fs.writeFileSync(file, JSON.stringify(fc));
  total += features.length;
  console.log(`${code} ${estados.get(code)}: ${features.length}`);

  if (code === "24") {
    const legacyFeatures = features.map((f) => ({
      type: "Feature",
      properties: {
        COD_ESTADO: f.properties.COD_ESTADO,
        ESTADO: ESTADO24_LEGACY.ESTADO,
        COD_MUNICIPIO: f.properties.COD_MUNICIPIO,
        MUNICIPIO: ESTADO24_LEGACY.MUNICIPIO,
      },
      geometry: f.geometry,
    }));
    const legacyFile = legacyMunicipio24Path(root);
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    fs.writeFileSync(
      legacyFile,
      JSON.stringify({ type: "FeatureCollection", features: legacyFeatures })
    );
    console.log(`24 ${ESTADO24_LEGACY.ESTADO} (${LEGACY_PATHS.municipio24}): ${legacyFeatures.length}`);
  }
}

console.log(`Total: ${total} municipios en ${codes.length} archivos`);
if (total !== collection.features.length) {
  throw new Error(`Se escribieron ${total} de ${collection.features.length}`);
}
