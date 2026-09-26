import { describe, expect, it } from 'vitest';
import { computeCategories, difference, intersection } from '../src/analysis/categories';
import { silentFollows } from '../src/analysis/engagement';
import { LIST_LABELS } from '../src/parse/parseExport';
import type { Account, Snapshot } from '../src/types';

const acc = (username: string): Account => ({ username, href: `https://www.instagram.com/${username}`, timestamp: 0 });
const names = (list: Account[]) => list.map((a) => a.username);

function snap(followers: string[], following: string[], overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    importedAt: 0,
    lists: {
      followers: followers.map(acc), following: following.map(acc), closeFriends: [], restricted: [],
      blocked: [acc('eve')], pendingSent: [], pendingReceived: [], recentlyUnfollowedByYou: [],
    },
    engagement: {},
    missing: [],
    ...overrides,
  };
}

const byKey = (s: Snapshot, prev: Snapshot | null) => Object.fromEntries(computeCategories(s, prev).map((c) => [c.key, c]));

describe('set helpers', () => {
  it('compare usernames case-insensitively', () => {
    expect(names(difference([acc('Alice'), acc('bob')], [acc('alice')]))).toEqual(['bob']);
    expect(names(intersection([acc('Alice'), acc('bob')], [acc('alice')]))).toEqual(['Alice']);
  });
});

describe('computeCategories', () => {
  it('computes relationship categories from one snapshot', () => {
    const c = byKey(snap(['alice', 'bob', 'fan'], ['alice', 'bob', 'celeb']), null);
    expect(names(c.nonFollowers.accounts)).toEqual(['celeb']);
    expect(names(c.fans.accounts)).toEqual(['fan']);
    expect(names(c.mutuals.accounts)).toEqual(['alice', 'bob']);
    expect(names(c.blocked.accounts)).toEqual(['eve']);
  });

  it('marks history categories unavailable without a previous snapshot', () => {
    const c = byKey(snap(['a'], ['a']), null);
    expect(c.unfollowedYou.available).toBe(false);
    expect(c.newFollowers.available).toBe(false);
    expect(c.unfollowedYou.unavailableReason).toMatch(/newer export/);
  });

  it('diffs followers against the previous snapshot', () => {
    const c = byKey(snap(['a', 'c'], []), snap(['a', 'b'], []));
    expect(names(c.unfollowedYou.accounts)).toEqual(['b']);
    expect(names(c.newFollowers.accounts)).toEqual(['c']);
    expect(c.unfollowedYou.available).toBe(true);
  });

  it('marks a direct list unavailable when its file was missing', () => {
    const c = byKey(snap([], [], { missing: [LIST_LABELS.restricted] }), null);
    expect(c.restricted.available).toBe(false);
  });

  it('silent follows need engagement data', () => {
    expect(byKey(snap([], ['a']), null).silentFollows.available).toBe(false);
    const withData = snap([], ['a', 'b'], { engagement: { b: { likes: 1, comments: 0, dmMessages: 0 } } });
    expect(names(byKey(withData, null).silentFollows.accounts)).toEqual(['a']);
  });
});

describe('silentFollows', () => {
  it('returns followed accounts with zero interactions', () => {
    const s = snap([], ['A', 'b'], { engagement: { a: { likes: 0, comments: 0, dmMessages: 4 } } });
    expect(names(silentFollows(s))).toEqual(['b']);
  });
});
