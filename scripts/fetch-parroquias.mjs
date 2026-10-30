import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import {
  ESTADO24_LEGACY,
  LEGACY_PATHS,
  legacyParroquias24Dir,
  parroquiasMunicipioDir,
  parroquiasMunicipioDirName,
} from "./legacy-dir.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "Parroquias");

/** COD-AB Venezuela (HDX), capa admin 3 — mismo dataset que OCHA adm2. */
const HDX_ZIP =
  "https://data.humdata.org/dataset/5b141d29-534f-4f01-a0bc-41e2f375d925/resource/93b05eca-adbd-4ce3-bae3-b4d6d64fac8b/download/ven_admin_boundaries.geojson.zip";

function stateNames() {
  const names = new Map();
  const dir = path.join(root, "Estados");
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith(".geojson")) continue;
    const geo = JSON.parse(
      fs.readFileSync(path.join(dir, file.name), "utf8")
    );
    const props = geo.features[0]?.properties;
    if (!props?.COD_ESTADO) continue;
    names.set(props.COD_ESTADO, props.ESTADO);
  }
  return names;
}

function municipioByCode() {
  const map = new Map();
  for (let i = 1; i <= 24; i++) {
    const code = String(i).padStart(2, "0");
    const file = path.join(root, "Municipios", `${code}.geojson`);
    if (!fs.existsSync(file)) {
      throw new Error(`Falta ${file}; ejecuta primero pnpm fetch:municipios`);
    }
    const geo = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const f of geo.features) {
      map.set(f.properties.COD_MUNICIPIO, f.properties);
    }
  }
  return map;
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
  return (
    a.minLon <= b.maxLon &&
    a.maxLon >= b.minLon &&
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat
  );
}

function writeParroquiaFile(filePath, feature) {
  fs.writeFileSync(
    filePath,
    JSON.stringify({ type: "FeatureCollection", features: [feature] })
  );
}

const MUNICIPIO_DIR = /^\d{4}_/;

function resetParroquiasOutput() {
  fs.mkdirSync(outDir, { recursive: true });

  const porMun = path.join(outDir, "ParroquiasPorMunicipio");
  fs.mkdirSync(porMun, { recursive: true });
  for (const ent of fs.readdirSync(porMun, { withFileTypes: true })) {
    const full = path.join(porMun, ent.name);
    if (ent.isFile() && ent.name.endsWith(".geojson")) {
      fs.unlinkSync(full);
    } else if (ent.isDirectory() && MUNICIPIO_DIR.test(ent.name)) {
      fs.rmSync(full, { recursive: true, force: true });
    }
  }

  const antiguas = path.join(outDir, "ParroquiasAntiguas");
  if (fs.existsSync(antiguas)) {
    fs.rmSync(antiguas, { recursive: true, force: true });
  }

  for (const ent of fs.readdirSync(outDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name === "ParroquiasPorMunicipio" || ent.name === "ParroquiasAntiguas") {
      continue;
    }
    if (MUNICIPIO_DIR.test(ent.name)) {
      fs.rmSync(path.join(outDir, ent.name), { recursive: true, force: true });
    }
  }
}

async function loadAdmin3FromHdx() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vengeojson-parr-"));
  const zipPath = path.join(tmp, "ven_admin_boundaries.geojson.zip");
  const extractDir = path.join(tmp, "extract");
  fs.mkdirSync(extractDir, { recursive: true });

  console.log("Descargando COD-AB (GeoJSON zip) desde HDX…");
  const response = await fetch(HDX_ZIP);
  if (!response.ok) {
    throw new Error(`HDX respondió ${response.status} ${response.statusText}`);
  }
  fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));

  if (process.platform === "win32") {
    const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`;
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      throw new Error(r.stderr || r.stdout || "Expand-Archive falló");
    }
  } else {
    const r = spawnSync(
      "unzip",
      ["-q", "-o", zipPath, "ven_admin3.geojson", "-d", extractDir],
      { encoding: "utf8" }
    );
    if (r.status !== 0) {
      throw new Error(r.stderr || "unzip falló (¿unzip instalado?)");
    }
  }

  const admin3Path = path.join(extractDir, "ven_admin3.geojson");
  if (!fs.existsSync(admin3Path)) {
    throw new Error("No se encontró ven_admin3.geojson en el zip");
  }
  const collection = JSON.parse(fs.readFileSync(admin3Path, "utf8"));
  fs.rmSync(tmp, { recursive: true, force: true });
  return collection;
}

const estados = stateNames();
const municipios = municipioByCode();
const stateBbox = new Map();
for (const [code] of estados) {
  const geo = JSON.parse(
    fs.readFileSync(path.join(root, "Estados", `${code}.geojson`), "utf8")
  );
  stateBbox.set(code, bboxOf(geo.features[0].geometry));
}

const collection = await loadAdmin3FromHdx();
if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
  throw new Error("ven_admin3.geojson no es un FeatureCollection");
}

const byMunicipio = new Map();
let skipped = 0;

for (const feature of collection.features) {
  const pcode = feature.properties?.adm1_pcode || "";
  const mcode = feature.properties?.adm2_pcode || "";
  const parrCodeRaw = feature.properties?.adm3_pcode || "";
  const code = pcode.replace(/^VE/, "");
  const munCode = mcode.replace(/^VE/, "");
  const parrCode = parrCodeRaw.replace(/^VE/, "");

  if (!/^\d{2}$/.test(code) || !estados.has(code)) {
    skipped++;
    continue;
  }
  if (!munCode.startsWith(code) || munCode.length !== 4) {
    throw new Error(`Código de municipio inválido: ${mcode}`);
  }
  if (!parrCode.startsWith(munCode) || parrCode.length !== 6) {
    throw new Error(`Código de parroquia inválido: ${parrCodeRaw}`);
  }

  const munProps = municipios.get(munCode);
  if (!munProps) {
    throw new Error(`Municipio ${munCode} no está en Municipios/`);
  }

  const parrName = (feature.properties.adm3_name || "").trim();
  if (!parrName) throw new Error(`Parroquia sin nombre: ${parrCodeRaw}`);

  if (!overlaps(bboxOf(feature.geometry), stateBbox.get(code))) {
    throw new Error(`${parrName} (${parrCodeRaw}) no se solapa con el estado ${code}`);
  }

  const next = {
    type: "Feature",
    properties: {
      COD_ESTADO: code,
      ESTADO: estados.get(code),
      COD_MUNICIPIO: munCode,
      MUNICIPIO: munProps.MUNICIPIO,
      COD_PARROQUIA: parrCode,
      PARROQUIA: parrName.toLocaleUpperCase("es"),
    },
    geometry: feature.geometry,
  };
  if (!byMunicipio.has(munCode)) byMunicipio.set(munCode, []);
  byMunicipio.get(munCode).push(next);
}

if (skipped > 0) {
  console.log(`Omitidas ${skipped} parroquias fuera de estados 01–24 (p. ej. VE25).`);
}

resetParroquiasOutput();

let total = 0;
const munCodes = [...byMunicipio.keys()].sort();

for (const munCode of munCodes) {
  const features = byMunicipio.get(munCode).sort((a, b) =>
    a.properties.COD_PARROQUIA.localeCompare(b.properties.COD_PARROQUIA)
  );
  const municipio = features[0].properties.MUNICIPIO;
  const dir = parroquiasMunicipioDir(root, munCode, municipio);
  fs.mkdirSync(dir, { recursive: true });

  for (const f of features) {
    writeParroquiaFile(
      path.join(dir, `${f.properties.COD_PARROQUIA}.geojson`),
      f
    );
    total++;
  }
  console.log(`${parroquiasMunicipioDirName(munCode, municipio)}: ${features.length}`);
}

const vargas2401 = byMunicipio.get("2401");
if (vargas2401?.length) {
  const legacyDir = legacyParroquias24Dir(root);
  fs.mkdirSync(legacyDir, { recursive: true });
  for (const f of vargas2401) {
    const legacyFeature = {
      type: "Feature",
      properties: {
        COD_ESTADO: f.properties.COD_ESTADO,
        ESTADO: ESTADO24_LEGACY.ESTADO,
        COD_MUNICIPIO: f.properties.COD_MUNICIPIO,
        MUNICIPIO: ESTADO24_LEGACY.MUNICIPIO,
        COD_PARROQUIA: f.properties.COD_PARROQUIA,
        PARROQUIA: f.properties.PARROQUIA,
      },
      geometry: f.geometry,
    };
    writeParroquiaFile(
      path.join(legacyDir, `${f.properties.COD_PARROQUIA}.geojson`),
      legacyFeature
    );
  }
  console.log(
    `Legacy ${LEGACY_PATHS.parroquias24}: ${vargas2401.length} archivos`
  );
}

console.log(`Total: ${total} parroquias en ${munCodes.length} municipios`);
const expected = collection.features.length - skipped;
if (total !== expected) {
  throw new Error(`Se escribieron ${total} de ${expected} features esperadas`);
}

const build = spawnSync(process.execPath, ["scripts/build-parroquias-por-municipio.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) {
  throw new Error("build-parroquias-por-municipio.mjs falló");
}
