import { LIST_LABELS } from '../parse/parseExport';
import type { Account, ListKey, Snapshot } from '../types';
import { silentFollows } from './engagement';

export type CategoryKey =
  | 'nonFollowers'
  | 'unfollowedYou'
  | 'newFollowers'
  | 'fans'
  | 'mutuals'
  | 'silentFollows'
  | 'closeFriends'
  | 'restricted'
  | 'blocked'
  | 'pendingSent'
  | 'pendingReceived'
  | 'recentlyUnfollowedByYou';

export interface Category {
  key: CategoryKey;
  label: string;
  description: string;
  accounts: Account[];
  available: boolean;
  unavailableReason: string;
}

const keyOf = (account: Account) => account.username.toLowerCase();

export function difference(a: Account[], b: Account[]): Account[] {
  const exclude = new Set(b.map(keyOf));
  return a.filter((account) => !exclude.has(keyOf(account)));
}

export function intersection(a: Account[], b: Account[]): Account[] {
  const include = new Set(b.map(keyOf));
  return a.filter((account) => include.has(keyOf(account)));
}

const NO_HISTORY = 'Import a newer export later to see changes since this one.';

function direct(current: Snapshot, key: ListKey & CategoryKey, label: string, description: string): Category {
  const available = !current.missing.includes(LIST_LABELS[key]);
  return {
    key,
    label,
    description,
    accounts: current.lists[key],
    available,
    unavailableReason: `${LIST_LABELS[key]} was not in this export.`,
  };
}

export function computeCategories(current: Snapshot, previous: Snapshot | null): Category[] {
  const { followers, following } = current.lists;
  const hasHistory = previous !== null;
  const hasEngagement = Object.keys(current.engagement).length > 0;

  return [
    {
      key: 'nonFollowers',
      label: "Don't follow back",
      description: "You follow them. They don't follow you.",
      accounts: difference(following, followers),
      available: true,
      unavailableReason: '',
    },
    {
      key: 'unfollowedYou',
      label: 'Unfollowed you',
      description: 'Followed you in your previous import but not in this one. Can include deactivated or deleted accounts.',
      accounts: previous ? difference(previous.lists.followers, followers) : [],
      available: hasHistory,
      unavailableReason: NO_HISTORY,
    },
    {
      key: 'newFollowers',
      label: 'New followers',
      description: 'Follow you now but did not in your previous import.',
      accounts: previous ? difference(followers, previous.lists.followers) : [],
      available: hasHistory,
      unavailableReason: NO_HISTORY,
    },
    {
      key: 'fans',
      label: 'Fans',
      description: "They follow you. You don't follow them.",
      accounts: difference(followers, following),
      available: true,
      unavailableReason: '',
    },
    {
      key: 'mutuals',
      label: 'Mutuals',
      description: 'You follow each other.',
      accounts: intersection(following, followers),
      available: true,
      unavailableReason: '',
    },
    {
      key: 'silentFollows',
      label: 'Silent follows',
      description:
        'You follow them but never liked, commented on or messaged them. Based on your own activity in the export. DM matching is best-effort.',
      accounts: hasEngagement ? silentFollows(current) : [],
      available: hasEngagement,
      unavailableReason: 'This export has no likes, comments or messages. Include them next time you export.',
    },
    direct(current, 'closeFriends', 'Close friends', 'Your close friends list.'),
    direct(current, 'restricted', 'Restricted', 'Accounts you restricted.'),
    direct(current, 'blocked', 'Blocked', 'Accounts you blocked.'),
    direct(current, 'pendingSent', 'Requests sent', 'Follow requests you sent that are still pending.'),
    direct(current, 'pendingReceived', 'Requests received', 'Follow requests you received.'),
    direct(current, 'recentlyUnfollowedByYou', 'You unfollowed', 'Accounts you recently unfollowed.'),
  ];
}
