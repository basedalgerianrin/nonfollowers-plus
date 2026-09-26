export interface Account {
  username: string;
  href: string;
  timestamp: number;
}

export type ListKey =
  | 'followers'
  | 'following'
  | 'closeFriends'
  | 'restricted'
  | 'blocked'
  | 'pendingSent'
  | 'pendingReceived'
  | 'recentlyUnfollowedByYou';

export interface Engagement {
  likes: number;
  comments: number;
  dmMessages: number;
}

export interface Snapshot {
  id?: number;
  importedAt: number;
  lists: Record<ListKey, Account[]>;
  engagement: Record<string, Engagement>;
  missing: string[];
}
