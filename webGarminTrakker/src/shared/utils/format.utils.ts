export function formatKm(value?: number): string {
  if (value == null) return "--";
  return `${value.toFixed(1)} km`;
}

export function formatEta(hours?: number | null): string {
  if (hours == null) return "--";

  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h <= 0) return `${m} min`;
  return `${h} h ${m} min`;
}