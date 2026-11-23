// Instagram names exports like "instagram-<user>-2026-11-06-<id>.zip". Ordering snapshots by this date (not by
// when the file was imported) keeps "previous vs current" correct when an older export is imported later.
export function exportTime(files: Array<{ name: string }>, fallback: number): number {
  for (const { name } of files) {
    const m = name.match(/(?:^|[-_])(\d{4})-(\d{2})-(\d{2})(?:[-_.]|$)/);
    if (m) {
      const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!Number.isNaN(t)) return t;
    }
  }
  return fallback;
}
