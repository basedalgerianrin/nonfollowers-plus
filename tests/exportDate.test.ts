import { describe, expect, it } from 'vitest';
import { exportTime } from '../src/parse/exportDate';

describe('exportTime', () => {
  it('reads the date from an Instagram export filename', () => {
    expect(exportTime([{ name: 'instagram-someone_-2026-11-06-s3jTnrkZ.zip' }], 5)).toBe(Date.UTC(2026, 10, 6));
  });
  it('orders an older export before a newer one regardless of import order', () => {
    expect(exportTime([{ name: 'instagram-x-2026-11-02-aaaa.zip' }], 9)).toBeLessThan(
      exportTime([{ name: 'instagram-x-2026-11-06-bbbb.zip' }], 1),
    );
  });
  it('falls back when no date is in the name', () => {
    expect(exportTime([{ name: 'followers_1.json' }], 42)).toBe(42);
  });
});

import JSZip from 'jszip';
import { zipTime } from '../src/parse/exportDate';

describe('zipTime', () => {
  it('uses the newest entry date inside the zip', async () => {
    const zip = new JSZip();
    zip.file('a.json', '[]', { date: new Date(2026, 10, 2, 11, 51) });
    zip.file('b.json', '[]', { date: new Date(2026, 10, 6, 15, 42) });
    const file = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'renamed.zip');
    const t = await zipTime([file]);
    expect(new Date(t!).getDate()).toBe(6);
  });
  it('returns null for non-zip input', async () => {
    expect(await zipTime([new File(['[]'], 'followers_1.json')])).toBeNull();
  });
});
