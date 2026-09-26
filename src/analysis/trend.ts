import type { Snapshot } from '../types';
import { difference } from './categories';

export interface TrendPoint {
  importedAt: number;
  followers: number;
  following: number;
  gained: number;
  lost: number;
}

export function buildTrend(snapshots: Snapshot[]): TrendPoint[] {
  const sorted = [...snapshots].sort((a, b) => a.importedAt - b.importedAt);
  return sorted.map((snapshot, i) => {
    const previous = sorted[i - 1];
    return {
      importedAt: snapshot.importedAt,
      followers: snapshot.lists.followers.length,
      following: snapshot.lists.following.length,
      gained: previous ? difference(snapshot.lists.followers, previous.lists.followers).length : 0,
      lost: previous ? difference(previous.lists.followers, snapshot.lists.followers).length : 0,
    };
  });
}
