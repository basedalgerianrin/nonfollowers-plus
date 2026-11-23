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
