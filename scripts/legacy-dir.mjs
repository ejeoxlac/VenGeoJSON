import path from "path";

/** Rutas de capas con denominación anterior del estado 24 (Vargas). Ajusta aquí si renombras carpetas. */
export const ESTADO24_LEGACY = { ESTADO: "VARGAS", MUNICIPIO: "VARGAS" };

export const LEGACY_PATHS = {
  venezuela: "MapasNacionalesAntiguos/venezuela.geojson",
  estado24: "Estados/EstadosAntiguos/24.geojson",
  municipio24: "Municipios/MunicipiosAntiguos/24.geojson",
};

export function legacyVenezuelaPath(root) {
  return path.join(root, "MapasNacionalesAntiguos", "venezuela.geojson");
}

export function legacyEstado24Path(root) {
  return path.join(root, "Estados", "EstadosAntiguos", "24.geojson");
}

export function legacyMunicipio24Path(root) {
  return path.join(root, "Municipios", "MunicipiosAntiguos", "24.geojson");
}
