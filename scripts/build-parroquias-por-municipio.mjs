import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LEGACY_PATHS, parroquiasPorMunicipioRoot, parroquiasRoot } from "./legacy-dir.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = parroquiasRoot(root);
const outDir = parroquiasPorMunicipioRoot(root);
const municipiosDir = path.join(root, "Municipios");

const EXPECTED_FILES = 335;
const EXPECTED_PARROQUIAS = 1134;
const MUNICIPIO_DIR = /^\d{4}_/;

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const rounded = i === 0 ? String(n) : n.toFixed(1);
  return `${rounded} ${units[i]} (${bytes.toLocaleString("es-VE")} bytes)`;
}

function expectedMunicipioCodes() {
  const codes = new Set();
  for (let i = 1; i <= 24; i++) {
    const file = path.join(municipiosDir, `${String(i).padStart(2, "0")}.geojson`);
    if (!fs.existsSync(file)) continue;
    const geo = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const feature of geo.features ?? []) {
      const code = feature.properties?.COD_MUNICIPIO;
      if (code != null && String(code) !== "") codes.add(String(code));
    }
  }
  return codes;
}

function collectByMunicipio() {
  const groups = new Map();
  if (!fs.existsSync(srcDir)) return groups;

  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name === "ParroquiasPorMunicipio" || ent.name === "ParroquiasAntiguas") {
      continue;
    }
    if (!MUNICIPIO_DIR.test(ent.name)) continue;

    const dir = path.join(srcDir, ent.name);
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".geojson")) continue;
      const geo = JSON.parse(fs.readFileSync(path.join(dir, file.name), "utf8"));
      for (const feature of geo.features ?? []) {
        const code = feature.properties?.COD_MUNICIPIO;
        if (code == null || String(code) === "") {
          console.warn(`Aviso: ${path.join(ent.name, file.name)} no tiene COD_MUNICIPIO`);
          continue;
        }
        const key = String(code);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(feature);
      }
    }
  }
  return groups;
}

const groups = collectByMunicipio();
const empty = [];

for (const code of expectedMunicipioCodes()) {
  if (!groups.has(code) || groups.get(code).length === 0) empty.push(code);
}
for (const [code, features] of groups) {
  if (features.length === 0 && !empty.includes(code)) empty.push(code);
}
empty.sort();
for (const code of empty) {
  console.warn(`Aviso: el municipio ${code} quedó con 0 parroquias`);
}

fs.mkdirSync(outDir, { recursive: true });

const written = new Set();
let totalParroquias = 0;
let largest = { name: "", bytes: -1 };
let totalBytes = 0;

for (const code of [...groups.keys()].sort()) {
  const features = groups.get(code);
  if (!features.length) continue;
  features.sort((a, b) =>
    String(a.properties?.COD_PARROQUIA ?? "").localeCompare(
      String(b.properties?.COD_PARROQUIA ?? ""),
      "en"
    )
  );

  const json = JSON.stringify({ type: "FeatureCollection", features });
  const name = `${code}.geojson`;
  fs.writeFileSync(path.join(outDir, name), json);
  const bytes = fs.statSync(path.join(outDir, name)).size;
  written.add(name);
  totalParroquias += features.length;
  totalBytes += bytes;
  if (bytes > largest.bytes) largest = { name, bytes };
}

for (const ent of fs.readdirSync(outDir, { withFileTypes: true })) {
  if (!ent.isFile() || !ent.name.endsWith(".geojson")) continue;
  if (!/^\d{4}\.geojson$/.test(ent.name)) continue;
  if (!written.has(ent.name)) {
    fs.unlinkSync(path.join(outDir, ent.name));
  }
}

console.log(`Archivos generados: ${written.size}`);
console.log(`Parroquias en total: ${totalParroquias}`);
if (largest.name) {
  console.log(
    `Archivo más grande: ${LEGACY_PATHS.parroquiasPorMunicipio}${largest.name} (${formatBytes(largest.bytes)})`
  );
}
console.log(`Tamaño total de los .geojson agrupados: ${formatBytes(totalBytes)}`);

if (written.size !== EXPECTED_FILES) {
  console.warn(`Aviso: se esperaban ${EXPECTED_FILES} archivos y se generaron ${written.size}`);
}
if (totalParroquias !== EXPECTED_PARROQUIAS) {
  console.warn(
    `Aviso: se esperaban ${EXPECTED_PARROQUIAS} parroquias y se agruparon ${totalParroquias}`
  );
}
