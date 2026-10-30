const LOWER_WORDS = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "el",
  "y",
  "e",
  "en",
  "al",
  "a",
]);

/**
 * Capitalización para nombres de carpetas bajo Parroquias/ (p. ej. 2303_Cabimas), no bajo ParroquiasPorMunicipio/.
 * No usar en propiedades GeoJSON: ahí se conserva el texto como viene de la fuente (mayúsculas).
 */
export function titleCaseEs(text) {
  if (text == null || typeof text !== "string") return text;
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("es");
      if (index > 0 && LOWER_WORDS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
    })
    .join(" ");
}
