import type { Account, Engagement, ListKey, Snapshot } from '../types';
import { extractEntries, toAccount } from './entries';

const LIST_PATTERNS: Record<ListKey, RegExp> = {
  followers: /(^|\/)followers_\d+\.json$/,
  following: /(^|\/)following\.json$/,
  closeFriends: /(^|\/)close_friends\.json$/,
  restricted: /(^|\/)restricted_profiles\.json$/,
  blocked: /(^|\/)blocked_profiles\.json$/,
  pendingSent: /(^|\/)(pending|recent)_follow_requests\.json$/,
  pendingReceived: /(^|\/)follow_requests_you'?ve_received\.json$/,
  recentlyUnfollowedByYou: /(^|\/)recently_unfollowed_profiles\.json$/,
};

export const LIST_LABELS: Record<ListKey, string> = {
  followers: 'Followers',
  following: 'Following',
  closeFriends: 'Close friends',
  restricted: 'Restricted accounts',
  blocked: 'Blocked accounts',
  pendingSent: 'Follow requests you sent',
  pendingReceived: 'Follow requests you received',
  recentlyUnfollowedByYou: 'Accounts you unfollowed',
};

const LIKES = /(^|\/)liked_posts\.json$/;
const COMMENTS = /(^|\/)post_comments(_\d+)?\.json$/;
const MESSAGES = /messages\/inbox\/([^/]+)\/message_\d+\.json$/;

export function isRelevantPath(path: string): boolean {
  return [...Object.values(LIST_PATTERNS), LIKES, COMMENTS, MESSAGES].some((pattern) => pattern.test(path));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function matching(files: Map<string, string>, pattern: RegExp): Array<[string, unknown]> {
  const found: Array<[string, unknown]> = [];
  for (const [path, text] of files) {
    if (!pattern.test(path)) continue;
    const data = parseJson(text);
    if (data !== undefined) found.push([path, data]);
  }
  return found.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
}

function dedupe(accounts: Account[]): Account[] {
  const byKey = new Map<string, Account>();
  for (const account of accounts) {
    const key = account.username.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, account);
  }
  return [...byKey.values()];
}

function bump(map: Record<string, Engagement>, username: string, field: keyof Engagement, by = 1): void {
  const key = username.trim().toLowerCase();
  if (!key) return;
  map[key] ??= { likes: 0, comments: 0, dmMessages: 0 };
  map[key][field] += by;
}

function ownerOf(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return '';
  const raw = entry as { title?: string; string_map_data?: Record<string, { value?: string }> };
  return raw.title || raw.string_map_data?.['Media Owner']?.value || '';
}

export function parseExport(files: Map<string, string>, importedAt: number): Snapshot {
  const lists = {} as Record<ListKey, Account[]>;
  const missing: string[] = [];

  for (const key of Object.keys(LIST_PATTERNS) as ListKey[]) {
    const found = matching(files, LIST_PATTERNS[key]);
    if (found.length === 0) missing.push(LIST_LABELS[key]);
    lists[key] = dedupe(
      found.flatMap(([, data]) => extractEntries(data).map(toAccount).filter((a): a is Account => a !== null)),
    );
  }

  if (missing.includes(LIST_LABELS.followers) && missing.includes(LIST_LABELS.following)) {
    throw new Error('No followers or following file found. Make sure you picked an Instagram export in JSON format.');
  }

  const engagement: Record<string, Engagement> = {};
  const likes = matching(files, LIKES);
  const comments = matching(files, COMMENTS);
  const messages = matching(files, MESSAGES);

  for (const [, data] of likes) for (const e of extractEntries(data)) bump(engagement, ownerOf(e), 'likes');
  for (const [, data] of comments) for (const e of extractEntries(data)) bump(engagement, ownerOf(e), 'comments');
  for (const [path, data] of messages) {
    const folder = path.match(MESSAGES)?.[1] ?? '';
    const count = (data as { messages?: unknown[] }).messages?.length ?? 0;
    bump(engagement, folder.replace(/_\d+$/, ''), 'dmMessages', count);
  }

  if (likes.length === 0) missing.push('Likes');
  if (comments.length === 0) missing.push('Comments');
  if (messages.length === 0) missing.push('Messages');

  return { importedAt, lists, engagement, missing };
}
