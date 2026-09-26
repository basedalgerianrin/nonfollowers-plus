import type { Account, Engagement, Snapshot } from '../types';

export function engagementTotal(e: Engagement | undefined): number {
  return e ? e.likes + e.comments + e.dmMessages : 0;
}

export function silentFollows(snapshot: Snapshot): Account[] {
  return snapshot.lists.following.filter(
    (account) => engagementTotal(snapshot.engagement[account.username.toLowerCase()]) === 0,
  );
}
