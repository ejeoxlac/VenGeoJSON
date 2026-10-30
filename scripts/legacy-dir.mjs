import path from "path";
import { titleCaseEs } from "./title-case.mjs";

/** Valores en GeoJSON (como la fuente). Carpetas usan `titleCaseEs` en `parroquiasMunicipioDirName`. */
export const ESTADO24_LEGACY = { ESTADO: "VARGAS", MUNICIPIO: "VARGAS" };

export const LEGACY_PATHS = {
  venezuela: "MapasNacionalesAntiguos/venezuela.geojson",
  estado24: "Estados/EstadosAntiguos/24.geojson",
  municipio24: "Municipios/MunicipiosAntiguos/24.geojson",
  parroquias24: "Parroquias/ParroquiasAntiguas/2401_Vargas/",
  parroquiasPorMunicipio: "Parroquias/ParroquiasPorMunicipio/",
};

/** Carpeta por municipio: p. ej. `2303_Cabimas` (solo el nombre de carpeta va en capitalización usual). */
export function parroquiasMunicipioDirName(codMunicipio, municipio) {
  const titled = titleCaseEs(municipio);
  const slug = titled
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return `${codMunicipio}_${slug}`;
}

export function parroquiasRoot(root) {
  return path.join(root, "Parroquias");
}

export function parroquiasPorMunicipioRoot(root) {
  return path.join(root, "Parroquias", "ParroquiasPorMunicipio");
}

export function parroquiasMunicipioDir(root, codMunicipio, municipio) {
  return path.join(
    parroquiasRoot(root),
    parroquiasMunicipioDirName(codMunicipio, municipio)
  );
}

export function legacyVenezuelaPath(root) {
  return path.join(root, "MapasNacionalesAntiguos", "venezuela.geojson");
}

export function legacyEstado24Path(root) {
  return path.join(root, "Estados", "EstadosAntiguos", "24.geojson");
}

export function legacyMunicipio24Path(root) {
  return path.join(root, "Municipios", "MunicipiosAntiguos", "24.geojson");
}

/** Parroquias del municipio 2401 con denominación estatal Vargas. */
export function legacyParroquias24Dir(root) {
  return path.join(
    parroquiasRoot(root),
    "ParroquiasAntiguas",
    parroquiasMunicipioDirName("2401", ESTADO24_LEGACY.MUNICIPIO)
  );
}
