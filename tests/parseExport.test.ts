import { describe, expect, it } from 'vitest';
import { isRelevantPath, LIST_LABELS, parseExport } from '../src/parse/parseExport';

const entry = (u: string, ts = 1) => ({ string_list_data: [{ href: `https://www.instagram.com/${u}`, value: u, timestamp: ts }] });
const base = 'connections/followers_and_following/';

function exportFiles(extra: Record<string, unknown> = {}): Map<string, string> {
  const files: Record<string, unknown> = {
    [`${base}followers_1.json`]: [entry('alice'), entry('bob')],
    [`${base}followers_2.json`]: [entry('carol'), entry('Alice')],
    [`${base}following.json`]: { relationships_following: [{ title: 'bob', string_list_data: [{ href: 'https://www.instagram.com/_u/bob', timestamp: 2 }] }, entry('dave')] },
    ...extra,
  };
  return new Map(Object.entries(files).map(([k, v]) => [k, JSON.stringify(v)]));
}

describe('parseExport', () => {
  it('merges followers_N files and dedupes case-insensitively', () => {
    const snap = parseExport(exportFiles(), 1000);
    expect(snap.importedAt).toBe(1000);
    expect(snap.lists.followers.map((a) => a.username)).toEqual(['alice', 'bob', 'carol']);
    expect(snap.lists.following.map((a) => a.username)).toEqual(['bob', 'dave']);
  });

  it('lists missing sources by label', () => {
    const snap = parseExport(exportFiles(), 0);
    expect(snap.missing).toContain(LIST_LABELS.blocked);
    expect(snap.missing).toContain('Likes');
    expect(snap.missing).toContain('Comments');
    expect(snap.missing).toContain('Messages');
    expect(snap.missing).not.toContain(LIST_LABELS.followers);
  });

  it('reads the relationship flag files', () => {
    const snap = parseExport(
      exportFiles({
        [`${base}blocked_profiles.json`]: { relationships_blocked_users: [entry('eve')] },
        [`${base}close_friends.json`]: { relationships_close_friends: [entry('bob')] },
        [`${base}recently_unfollowed_profiles.json`]: { relationships_unfollowed_users: [entry('zed')] },
        [`${base}follow_requests_you've_received.json`]: { relationships_follow_requests_received: [entry('fan1')] },
        [`${base}recent_follow_requests.json`]: { relationships_permanent_follow_requests: [entry('sent1')] },
      }),
      0,
    );
    expect(snap.lists.blocked.map((a) => a.username)).toEqual(['eve']);
    expect(snap.lists.closeFriends.map((a) => a.username)).toEqual(['bob']);
    expect(snap.lists.recentlyUnfollowedByYou.map((a) => a.username)).toEqual(['zed']);
    expect(snap.lists.pendingReceived.map((a) => a.username)).toEqual(['fan1']);
    expect(snap.lists.pendingSent.map((a) => a.username)).toEqual(['sent1']);
  });

  it('counts likes, comments and DM messages per lowercase username', () => {
    const snap = parseExport(
      exportFiles({
        'your_instagram_activity/likes/liked_posts.json': { likes_media_likes: [{ title: 'Bob' }, { title: 'bob' }] },
        'your_instagram_activity/comments/post_comments_1.json': [{ string_map_data: { 'Media Owner': { value: 'dave' } } }],
        'your_instagram_activity/messages/inbox/bob_123456/message_1.json': { messages: [{}, {}, {}] },
      }),
      0,
    );
    expect(snap.engagement.bob).toEqual({ likes: 2, comments: 0, dmMessages: 3 });
    expect(snap.engagement.dave).toEqual({ likes: 0, comments: 1, dmMessages: 0 });
    expect(snap.missing).not.toContain('Likes');
  });

  it('treats unreadable JSON as missing', () => {
    const files = exportFiles();
    files.set(`${base}blocked_profiles.json`, '{not json');
    expect(parseExport(files, 0).missing).toContain(LIST_LABELS.blocked);
  });

  it('flags categories with unreadable files as partial', () => {
    const files = exportFiles();
    files.set(`${base}followers_2.json`, '{bad');
    const snap = parseExport(files, 0);
    expect(snap.lists.followers.map((a) => a.username)).toEqual(['alice', 'bob']);
    expect(snap.missing).toContain(LIST_LABELS.followers);
  });

  it('throws when neither followers nor following exist', () => {
    expect(() => parseExport(new Map([['random.json', '[]']]), 0)).toThrow(/followers or following/);
  });
});

describe('isRelevantPath', () => {
  it('accepts known files and rejects others', () => {
    expect(isRelevantPath('connections/followers_and_following/following.json')).toBe(true);
    expect(isRelevantPath('followers_1.json')).toBe(true);
    expect(isRelevantPath('your_instagram_activity/messages/inbox/bob_1/message_1.json')).toBe(true);
    expect(isRelevantPath('connections/followers_and_following/following_hashtags.json')).toBe(false);
    expect(isRelevantPath('media/posts/1.jpg')).toBe(false);
  });

  it("accepts curly apostrophe in follow_requests_you've_received", () => {
    expect(isRelevantPath("x/follow_requests_you've_received.json")).toBe(true);
  });
});
