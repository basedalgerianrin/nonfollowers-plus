import type { TrendPoint } from '../analysis/trend';

export function renderTrendSvg(points: TrendPoint[], width = 320, height = 160): string {
  if (points.length < 2) return '';
  const pad = 24;
  const values = points.flatMap((p) => [p.followers, p.following]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (points.length - 1);
  const y = (v: number) => height - pad - ((v - min) * (height - 2 * pad)) / span;
  const line = (pick: (p: TrendPoint) => number) =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ');

  return (
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Followers and following over time">` +
    `<polyline class="line-followers" fill="none" points="${line((p) => p.followers)}"/>` +
    `<polyline class="line-following" fill="none" points="${line((p) => p.following)}"/>` +
    `<text class="axis" x="${pad}" y="14">${max}</text>` +
    `<text class="axis" x="${pad}" y="${height - 6}">${min}</text>` +
    `</svg>`
  );
}
