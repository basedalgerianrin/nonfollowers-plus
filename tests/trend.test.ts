import { describe, expect, it } from 'vitest';
import { buildTrend } from '../src/analysis/trend';
import { renderTrendSvg } from '../src/ui/chart';
import { LIST_LABELS } from '../src/parse/parseExport';
import type { Snapshot } from '../src/types';

const acc = (username: string) => ({ username, href: '', timestamp: 0 });
const snap = (importedAt: number, followers: string[], following: string[]): Snapshot => ({
  importedAt,
  lists: {
    followers: followers.map(acc), following: following.map(acc), closeFriends: [], restricted: [], blocked: [],
    pendingSent: [], pendingReceived: [], recentlyUnfollowedByYou: [],
  },
  engagement: {},
  missing: [],
});

describe('buildTrend', () => {
  it('sorts by time and counts gains and losses', () => {
    const points = buildTrend([snap(20, ['a', 'c', 'd'], ['x']), snap(10, ['a', 'b'], [])]);
    expect(points).toEqual([
      { importedAt: 10, followers: 2, following: 0, gained: 0, lost: 0, complete: true },
      { importedAt: 20, followers: 3, following: 1, gained: 2, lost: 1, complete: true },
    ]);
  });

  it('does not count changes when either import has incomplete followers', () => {
    const partial = { ...snap(20, ['a'], []), missing: [LIST_LABELS.followers] };
    const [, point] = buildTrend([snap(10, ['a', 'b'], []), partial]);
    expect(point).toMatchObject({ gained: 0, lost: 0, complete: false });
  });
});

describe('renderTrendSvg', () => {
  it('returns an empty string with fewer than two points', () => {
    expect(renderTrendSvg([{ importedAt: 1, followers: 1, following: 1, gained: 0, lost: 0, complete: true }])).toBe('');
  });

  it('draws two polylines with min and max labels', () => {
    const svg = renderTrendSvg([
      { importedAt: 1, followers: 100, following: 50, gained: 0, lost: 0, complete: true },
      { importedAt: 2, followers: 120, following: 55, gained: 20, lost: 0, complete: true },
    ]);
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    expect(svg).toContain('>120<');
    expect(svg).toContain('>50<');
  });
});
