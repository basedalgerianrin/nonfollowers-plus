import type { Account, Engagement, ListKey, Snapshot } from '../types';
import { extractEntries, toAccount } from './entries';

const LIST_PATTERNS: Record<ListKey, RegExp> = {
  followers: /(^|\/)followers_\d+\.json$/,
  following: /(^|\/)following\.json$/,
  closeFriends: /(^|\/)close_friends\.json$/,
  restricted: /(^|\/)restricted_profiles\.json$/,
  blocked: /(^|\/)blocked_profiles\.json$/,
  pendingSent: /(^|\/)(pending|recent)_follow_requests\.json$/,
  pendingReceived: /(^|\/)follow_requests_you['\u2019]?ve_received\.json$/,
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

function matching(files: Map<string, string>, pattern: RegExp): { found: Array<[string, unknown]>; failed: boolean } {
  const found: Array<[string, unknown]> = [];
  let failed = false;
  for (const [path, text] of files) {
    if (!pattern.test(path)) continue;
    const data = parseJson(text);
    if (data !== undefined) {
      found.push([path, data]);
    } else {
      failed = true;
    }
  }
  return { found: found.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })), failed };
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
  const results: Record<ListKey, { found: Array<[string, unknown]>; failed: boolean }> = {} as Record<ListKey, { found: Array<[string, unknown]>; failed: boolean }>;

  for (const key of Object.keys(LIST_PATTERNS) as ListKey[]) {
    const result = matching(files, LIST_PATTERNS[key]);
    results[key] = result;
    if (result.found.length === 0 || result.failed) missing.push(LIST_LABELS[key]);
    lists[key] = dedupe(
      result.found.flatMap(([, data]) => extractEntries(data).map(toAccount).filter((a): a is Account => a !== null)),
    );
  }

  if (results.followers.found.length === 0 && results.following.found.length === 0) {
    throw new Error('No followers or following file found. Make sure you picked an Instagram export in JSON format.');
  }

  const engagement: Record<string, Engagement> = {};
  const likesResult = matching(files, LIKES);
  const commentsResult = matching(files, COMMENTS);
  const messagesResult = matching(files, MESSAGES);

  for (const [, data] of likesResult.found) for (const e of extractEntries(data)) bump(engagement, ownerOf(e), 'likes');
  for (const [, data] of commentsResult.found) for (const e of extractEntries(data)) bump(engagement, ownerOf(e), 'comments');
  for (const [path, data] of messagesResult.found) {
    const folder = path.match(MESSAGES)?.[1] ?? '';
    const count = (data as { messages?: unknown[] }).messages?.length ?? 0;
    bump(engagement, folder.replace(/_\d+$/, ''), 'dmMessages', count);
  }

  if (likesResult.found.length === 0 || likesResult.failed) missing.push('Likes');
  if (commentsResult.found.length === 0 || commentsResult.failed) missing.push('Comments');
  if (messagesResult.found.length === 0 || messagesResult.failed) missing.push('Messages');

  return { importedAt, lists, engagement, missing };
}
