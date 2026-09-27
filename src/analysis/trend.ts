import type { Snapshot } from '../types';
import { LIST_LABELS } from '../parse/parseExport';
import { difference } from './categories';

export interface TrendPoint {
  importedAt: number;
  followers: number;
  following: number;
  gained: number;
  lost: number;
  complete: boolean;
}

const followersComplete = (s: Snapshot) => !s.missing.includes(LIST_LABELS.followers);

export function buildTrend(snapshots: Snapshot[]): TrendPoint[] {
  const sorted = [...snapshots].sort((a, b) => a.importedAt - b.importedAt);
  return sorted.map((snapshot, i) => {
    const previous = sorted[i - 1];
    const complete = followersComplete(snapshot) && (!previous || followersComplete(previous));
    const compare = previous && complete;
    return {
      importedAt: snapshot.importedAt,
      followers: snapshot.lists.followers.length,
      following: snapshot.lists.following.length,
      gained: compare ? difference(snapshot.lists.followers, previous.lists.followers).length : 0,
      lost: compare ? difference(previous.lists.followers, snapshot.lists.followers).length : 0,
      complete,
    };
  });
}
