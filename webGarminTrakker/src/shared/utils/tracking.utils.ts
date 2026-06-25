export function calculateAverageSpeedKmH(
  distanceCoveredKm: number,
  trackingStartTime: number,
  now = Date.now()
): number | null {
  const elapsedMs = now - trackingStartTime;
  if (elapsedMs <= 0) return null;

  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  if (elapsedHours === 0) return null;

  return distanceCoveredKm / elapsedHours;
}

export function calculateEtaHours(
  remainingDistanceKm: number,
  averageSpeedKmH?: number | null
): number | null {
  if (!averageSpeedKmH || averageSpeedKmH <= 0) return null;
  return remainingDistanceKm / averageSpeedKmH;
}