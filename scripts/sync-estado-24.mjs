import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  LEGACY_PATHS,
  legacyEstado24Path,
  legacyVenezuelaPath,
} from "./legacy-dir.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const code = "24";
const legacyName = "VARGAS";
const currentName = "LA GUAIRA";

function readEstado24() {
  const file = path.join(root, "Estados", `${code}.geojson`);
  const geo = JSON.parse(fs.readFileSync(file, "utf8"));
  const feature = geo.features[0];
  if (!feature?.geometry) throw new Error("Estados/24.geojson no tiene geometría");
  if (feature.properties?.COD_ESTADO !== code) {
    throw new Error("Estados/24.geojson no es el estado 24");
  }
  return feature;
}

function writeEstadoAt(filePath, estadoName) {
  const feature = readEstado24();
  const fc = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { COD_ESTADO: code, ESTADO: estadoName },
        geometry: feature.geometry,
      },
    ],
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(fc));
}

function writeEstadoInEstadosDir(estadoName) {
  writeEstadoAt(path.join(root, "Estados", `${code}.geojson`), estadoName);
}

function syncEstadosPerState() {
  const legacyFile = legacyEstado24Path(root);
  const current = readEstado24().properties.ESTADO;

  if (current === legacyName) {
    fs.copyFileSync(path.join(root, "Estados", `${code}.geojson`), legacyFile);
    writeEstadoInEstadosDir(currentName);
    console.log(`${LEGACY_PATHS.estado24} → ${legacyName}`);
    console.log(`Estados/${code}.geojson → ${currentName}`);
  } else if (current === currentName) {
    writeEstadoAt(legacyFile, legacyName);
    console.log(`${LEGACY_PATHS.estado24} → ${legacyName} (actualizado)`);
    console.log(`Estados/${code}.geojson → ${currentName}`);
  } else {
    throw new Error(`ESTADO inesperado en Estados/24: ${current}`);
  }
}

function withEstado24Name(collection, estadoName) {
  const next = structuredClone(collection);
  const feature = next.features.find((f) => f.properties?.COD_ESTADO === code);
  if (!feature) throw new Error("venezuela.geojson no incluye COD_ESTADO 24");
  feature.properties.ESTADO = estadoName;
  return next;
}

function syncVenezuelaNacional() {
  const nationalPath = path.join(root, "venezuela.geojson");
  const legacyNationalPath = legacyVenezuelaPath(root);

  const geo = JSON.parse(fs.readFileSync(nationalPath, "utf8"));
  if (geo.type !== "FeatureCollection" || !Array.isArray(geo.features)) {
    throw new Error("venezuela.geojson no es un FeatureCollection");
  }

  const feature24 = geo.features.find((f) => f.properties?.COD_ESTADO === code);
  if (!feature24) throw new Error("venezuela.geojson no incluye COD_ESTADO 24");

  fs.mkdirSync(path.dirname(legacyNationalPath), { recursive: true });

  if (feature24.properties.ESTADO === legacyName) {
    fs.copyFileSync(nationalPath, legacyNationalPath);
    fs.writeFileSync(nationalPath, JSON.stringify(withEstado24Name(geo, currentName)));
    console.log(`${LEGACY_PATHS.venezuela} → ${legacyName} (copia Geocadena)`);
    console.log(`venezuela.geojson → ${currentName}`);
  } else if (feature24.properties.ESTADO === currentName) {
    fs.writeFileSync(
      legacyNationalPath,
      JSON.stringify(withEstado24Name(geo, legacyName))
    );
    console.log(`${LEGACY_PATHS.venezuela} → ${legacyName} (actualizado)`);
    console.log(`venezuela.geojson → ${currentName}`);
  } else {
    throw new Error(
      `ESTADO inesperado en venezuela.geojson (24): ${feature24.properties.ESTADO}`
    );
  }
}

syncEstadosPerState();
syncVenezuelaNacional();
