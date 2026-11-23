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

// Newest file timestamp stored inside any zip (every Instagram export entry carries its creation date/time).
// Returns null for non-zip input or if the archive has no usable dates.
export async function zipTime(files: File[]): Promise<number | null> {
  const { default: JSZip } = await import('jszip');
  let newest: number | null = null;
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.zip')) continue;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    for (const entry of Object.values(zip.files)) {
      const t = entry.date?.getTime();
      if (t !== undefined && !Number.isNaN(t) && (newest === null || t > newest)) newest = t;
    }
  }
  return newest;
}
