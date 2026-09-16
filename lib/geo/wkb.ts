// Décodage minimal d'un point EWKB — format renvoyé par PostgREST pour une
// colonne `geography(Point, 4326)` sélectionnée normalement (aucun cast
// GeoJSON n'est configuré côté serveur ici) : Postgres sérialise la valeur
// avec la fonction de sortie texte par défaut du type `geography`, qui est
// une chaîne hexadécimale EWKB, ex. "0101000020E610000000000000000000000000000000000000".
// On n'a besoin de décoder qu'un point 2D (pas de Z/M, pas de types
// composites) : un parseur WKB générique serait hors scope ici.
//
// Structure décodée (cas standard produit par PostGIS) :
//   byte 0      : ordre des octets (1 = little-endian — toujours le cas ici)
//   bytes 1-4   : type de géométrie (uint32), bit 0x20000000 posé si un SRID suit
//   bytes 5-8   : SRID (uint32), présent seulement si le bit ci-dessus est posé
//   8 octets    : X / longitude (double)
//   8 octets    : Y / latitude (double)

export function parseGeographyPointHex(
  hex: string | null | undefined
): { lat: number; lng: number } | null {
  if (!hex) return null;

  try {
    const byteCount = hex.length / 2;
    if (!Number.isInteger(byteCount) || byteCount < 5) return null;

    const bytes = new Uint8Array(byteCount);
    for (let i = 0; i < byteCount; i += 1) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }

    const view = new DataView(bytes.buffer);
    const littleEndian = bytes[0] === 1;
    const typeWord = view.getUint32(1, littleEndian);
    const hasSrid = (typeWord & 0x20000000) !== 0;
    const xOffset = hasSrid ? 9 : 5;

    if (byteCount < xOffset + 16) return null;

    const lng = view.getFloat64(xOffset, littleEndian);
    const lat = view.getFloat64(xOffset + 8, littleEndian);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

/**
 * Formate un point en WKT `POINT(lng lat)`, la forme texte acceptée en
 * insert/update sur une colonne `geography(Point, 4326)` via PostgREST (cast
 * implicite texte -> geography), même format que celui déjà utilisé dans
 * `app/onboarding.tsx`.
 */
export function toPointWkt(point: { lat: number; lng: number }): string {
  return `POINT(${point.lng} ${point.lat})`;
}
