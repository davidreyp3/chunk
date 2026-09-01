/** Panama is UTC-5 all year — no daylight saving — so a fixed offset is correct. */
export const PANAMA_OFFSET_MIN = -5 * 60;

export function panamaNow(): Date {
  return new Date(Date.now() + PANAMA_OFFSET_MIN * 60_000);
}

/** Today's business date in Panama, as YYYY-MM-DD. */
export function businessToday(): string {
  return panamaNow().toISOString().slice(0, 10);
}

/** Epoch seconds for the start and end of a Panama calendar day. */
export function panamaDayBounds(day: string): { fini: number; ffin: number } {
  const start = Date.parse(`${day}T00:00:00-05:00`) / 1000;
  return { fini: Math.floor(start), ffin: Math.floor(start) + 86_399 };
}

/** The same weekday, N weeks back. */
export function priorSameWeekdays(day: string, weeks: number): string[] {
  const base = Date.parse(`${day}T12:00:00-05:00`);
  return Array.from({ length: weeks }, (_, i) =>
    new Date(base - (i + 1) * 7 * 86_400_000).toISOString().slice(0, 10),
  );
}
