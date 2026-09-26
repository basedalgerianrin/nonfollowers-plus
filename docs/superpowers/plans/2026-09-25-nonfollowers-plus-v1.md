# NonFollowers+ V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-capable iPhone PWA that parses an Instagram JSON export on-device and shows follower relationship categories, history diffs, silent follows, a trend chart, and copy/CSV export.

**Architecture:** Vite + TypeScript, no UI framework. Pure functions for parsing (`src/parse`), analysis (`src/analysis`) and export (`src/export`) are unit-tested with Vitest. IndexedDB stores snapshots (`src/storage`). A single DOM renderer (`src/ui/render.ts`) redraws from state held in `src/main.ts`. vite-plugin-pwa generates the manifest and precaching service worker. GitHub Actions deploys `dist/` to GitHub Pages.

**Tech Stack:** Node 22, Vite, TypeScript (strict), Vitest, jsdom, fake-indexeddb, JSZip, vite-plugin-pwa, ImageMagick (`convert`) for icons.

## Global Constraints

- Project root: `~/nonfollowers-plus` (git repo, branch renamed to `main` in Task 10).
- No UI framework. No runtime network requests other than loading the app's own static files. No analytics and no CDN scripts.
- Vite `base` must be `/nonfollowers-plus/` (GitHub Pages project path).
- Untrusted input: never use `innerHTML` with export data. Use `textContent` only. `href` values from the export are kept only if they match `^https://(www\.)?instagram\.com/`.
- UI copy: plain, professional, no emojis. Dark theme.
- Usernames are compared case-insensitively (`toLowerCase()`).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `npm test` (Vitest, `node` environment by default; DOM tests opt in with `// @vitest-environment jsdom`).

## File Structure

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html, .gitignore
public/icon.svg, public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png
src/types.ts                  shared types (Account, Snapshot, ListKey, Engagement)
src/parse/entries.ts          one export entry -> Account; find entry arrays
src/parse/parseExport.ts      Map<path,text> -> Snapshot (+ LIST_LABELS, isRelevantPath)
src/parse/readInput.ts        File[] (.zip or .json) -> Map<path,text>
src/storage/snapshotStore.ts  IndexedDB save/list/delete/clear
src/analysis/engagement.ts    engagementTotal, silentFollows
src/analysis/categories.ts    difference, intersection, computeCategories
src/analysis/trend.ts         buildTrend
src/export/listExport.ts      toUsernameText, toCsv, formatDate
src/ui/chart.ts               renderTrendSvg (numbers-only SVG string)
src/ui/render.ts              renderApp, filterAccounts
src/main.ts                   state, handlers, boot
src/style.css
tests/*.test.ts
.github/workflows/deploy.yml
```

---

### Task 1: Scaffold project, shared types, entry parsing

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/types.ts`, `src/parse/entries.ts`
- Test: `tests/entries.test.ts`

**Interfaces:**
- Produces: types `Account`, `ListKey`, `Engagement`, `Snapshot` (below); `usernameFromHref(href: string): string`; `extractEntries(data: unknown): unknown[]`; `toAccount(entry: unknown): Account | null`.

- [ ] **Step 1: Initialise npm and install dependencies**

```bash
cd ~/nonfollowers-plus
npm init -y
npm install jszip
npm install -D vite typescript vitest jsdom fake-indexeddb vite-plugin-pwa
```
If npm reports a peer-dependency conflict between `vite-plugin-pwa` and `vite`, reinstall vite at the highest major that `vite-plugin-pwa`'s `peerDependencies` allows (`npm view vite-plugin-pwa peerDependencies`), e.g. `npm install -D vite@7`.

Then edit `package.json` so it has `"type": "module"`, `"private": true`, and exactly these scripts:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 2: Config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

`.gitignore`:
```
node_modules
dist
dev-dist
```

- [ ] **Step 3: Shared types — `src/types.ts`**

```ts
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
```

- [ ] **Step 4: Write the failing test — `tests/entries.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { extractEntries, toAccount, usernameFromHref } from '../src/parse/entries';

describe('usernameFromHref', () => {
  it('reads plain and _u profile links', () => {
    expect(usernameFromHref('https://www.instagram.com/alice')).toBe('alice');
    expect(usernameFromHref('https://www.instagram.com/_u/bob')).toBe('bob');
    expect(usernameFromHref('https://example.com/x')).toBe('');
  });
});

describe('extractEntries', () => {
  it('returns top-level arrays as-is', () => {
    expect(extractEntries([1, 2])).toEqual([1, 2]);
  });
  it('returns the first array property of an object', () => {
    expect(extractEntries({ relationships_following: [1] })).toEqual([1]);
  });
  it('returns [] when there is no array', () => {
    expect(extractEntries({ x: 1 })).toEqual([]);
    expect(extractEntries(null)).toEqual([]);
  });
});

describe('toAccount', () => {
  it('uses string_list_data value (older export format)', () => {
    expect(
      toAccount({ string_list_data: [{ href: 'https://www.instagram.com/alice', value: 'alice', timestamp: 1700000000 }] }),
    ).toEqual({ username: 'alice', href: 'https://www.instagram.com/alice', timestamp: 1700000000 });
  });
  it('falls back to title (newer export format)', () => {
    expect(toAccount({ title: 'bob', string_list_data: [{ href: 'https://www.instagram.com/_u/bob', timestamp: 5 }] })).toEqual({
      username: 'bob',
      href: 'https://www.instagram.com/_u/bob',
      timestamp: 5,
    });
  });
  it('falls back to the href path', () => {
    expect(toAccount({ string_list_data: [{ href: 'https://www.instagram.com/_u/carol' }] })).toEqual({
      username: 'carol',
      href: 'https://www.instagram.com/_u/carol',
      timestamp: 0,
    });
  });
  it('replaces non-instagram hrefs with a safe profile link', () => {
    expect(toAccount({ string_list_data: [{ href: 'javascript:alert(1)', value: 'dave' }] })?.href).toBe(
      'https://www.instagram.com/dave',
    );
  });
  it('returns null for unusable entries', () => {
    expect(toAccount({})).toBeNull();
    expect(toAccount(null)).toBeNull();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/parse/entries`.

- [ ] **Step 6: Implement `src/parse/entries.ts`**

```ts
import type { Account } from '../types';

interface RawEntry {
  title?: string;
  string_list_data?: Array<{ href?: string; value?: string; timestamp?: number }>;
}

const INSTAGRAM_URL = /^https:\/\/(www\.)?instagram\.com\//;

export function usernameFromHref(href: string): string {
  const match = href.match(/instagram\.com\/(?:_u\/)?([^/?#]+)/);
  return match ? match[1] : '';
}

export function extractEntries(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

export function toAccount(entry: unknown): Account | null {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as RawEntry;
  const first = raw.string_list_data?.[0] ?? {};
  const href = first.href ?? '';
  const username = (first.value || raw.title || usernameFromHref(href)).trim();
  if (!username) return null;
  return {
    username,
    href: INSTAGRAM_URL.test(href) ? href : `https://www.instagram.com/${encodeURIComponent(username)}`,
    timestamp: first.timestamp ?? 0,
  };
}
```

- [ ] **Step 7: Run tests, verify pass, then type-check**

Run: `npm test` → Expected: all `entries` tests PASS.
Run: `npx tsc` → Expected: no output (exit 0).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src tests
git commit -m "feat: scaffold project and parse export entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Parse a whole export into a Snapshot

**Files:**
- Create: `src/parse/parseExport.ts`
- Test: `tests/parseExport.test.ts`

**Interfaces:**
- Consumes: `extractEntries`, `toAccount` (Task 1); types from `src/types.ts`.
- Produces: `LIST_LABELS: Record<ListKey, string>`; `isRelevantPath(path: string): boolean`; `parseExport(files: Map<string, string>, importedAt: number): Snapshot` — throws `Error` if neither followers nor following is present. Engagement keys are lowercase usernames.

- [ ] **Step 1: Write the failing test — `tests/parseExport.test.ts`**

```ts
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `../src/parse/parseExport`.

- [ ] **Step 3: Implement `src/parse/parseExport.ts`**

```ts
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
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test && npx tsc` → Expected: all tests PASS, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/parse/parseExport.ts tests/parseExport.test.ts
git commit -m "feat: parse full Instagram export into a snapshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Read picked files (ZIP or loose JSON)

**Files:**
- Create: `src/parse/readInput.ts`
- Test: `tests/readInput.test.ts`

**Interfaces:**
- Consumes: `isRelevantPath` (Task 2).
- Produces: `readInput(files: File[]): Promise<Map<string, string>>` — keys are ZIP entry paths, or the file name for loose `.json` files. Only relevant paths from ZIPs are decompressed.

- [ ] **Step 1: Write the failing test — `tests/readInput.test.ts`**

```ts
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { readInput } from '../src/parse/readInput';

describe('readInput', () => {
  it('extracts only relevant JSON files from a zip', async () => {
    const zip = new JSZip();
    zip.file('connections/followers_and_following/followers_1.json', '[]');
    zip.file('connections/followers_and_following/following_hashtags.json', '[]');
    zip.file('media/posts/1.jpg', 'binary');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const result = await readInput([new File([bytes], 'instagram-export.zip')]);
    expect([...result.keys()]).toEqual(['connections/followers_and_following/followers_1.json']);
    expect(result.get('connections/followers_and_following/followers_1.json')).toBe('[]');
  });

  it('accepts loose json files keyed by name', async () => {
    const result = await readInput([new File(['{"a":[]}'], 'following.json'), new File(['x'], 'notes.txt')]);
    expect([...result.entries()]).toEqual([['following.json', '{"a":[]}']]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `../src/parse/readInput`.

- [ ] **Step 3: Implement `src/parse/readInput.ts`**

```ts
import JSZip from 'jszip';
import { isRelevantPath } from './parseExport';

export async function readInput(files: File[]): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && isRelevantPath(entry.name)) {
          contents.set(entry.name, await entry.async('string'));
        }
      }
    } else if (name.endsWith('.json')) {
      contents.set(file.name, await file.text());
    }
  }
  return contents;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test && npx tsc` → Expected: PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/parse/readInput.ts tests/readInput.test.ts
git commit -m "feat: read Instagram export from zip or loose json files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: IndexedDB snapshot store

**Files:**
- Create: `src/storage/snapshotStore.ts`
- Test: `tests/snapshotStore.test.ts`

**Interfaces:**
- Consumes: `Snapshot` type.
- Produces: `saveSnapshot(s: Snapshot): Promise<Snapshot>` (returns it with `id` set); `listSnapshots(): Promise<Snapshot[]>` (sorted by `importedAt` ascending); `deleteSnapshot(id: number): Promise<void>`; `clearSnapshots(): Promise<void>`.

- [ ] **Step 1: Write the failing test — `tests/snapshotStore.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearSnapshots, deleteSnapshot, listSnapshots, saveSnapshot } from '../src/storage/snapshotStore';
import type { Snapshot } from '../src/types';

const snap = (importedAt: number): Snapshot => ({
  importedAt,
  lists: {
    followers: [], following: [], closeFriends: [], restricted: [], blocked: [],
    pendingSent: [], pendingReceived: [], recentlyUnfollowedByYou: [],
  },
  engagement: {},
  missing: [],
});

describe('snapshotStore', () => {
  beforeEach(async () => {
    await clearSnapshots();
  });

  it('saves and lists snapshots sorted by import time', async () => {
    const later = await saveSnapshot(snap(200));
    await saveSnapshot(snap(100));
    expect(typeof later.id).toBe('number');
    expect((await listSnapshots()).map((s) => s.importedAt)).toEqual([100, 200]);
  });

  it('deletes one snapshot by id', async () => {
    const a = await saveSnapshot(snap(1));
    await saveSnapshot(snap(2));
    await deleteSnapshot(a.id!);
    expect((await listSnapshots()).map((s) => s.importedAt)).toEqual([2]);
  });

  it('clears everything', async () => {
    await saveSnapshot(snap(1));
    await clearSnapshots();
    expect(await listSnapshots()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `../src/storage/snapshotStore`.

- [ ] **Step 3: Implement `src/storage/snapshotStore.ts`**

```ts
import type { Snapshot } from '../types';

const DB_NAME = 'nonfollowers-plus';
const STORE = 'snapshots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function saveSnapshot(snapshot: Snapshot): Promise<Snapshot> {
  const { id: _ignored, ...withoutId } = snapshot;
  const id = await run('readwrite', (store) => store.add(withoutId));
  return { ...withoutId, id: id as number };
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const all = await run('readonly', (store) => store.getAll() as IDBRequest<Snapshot[]>);
  return all.sort((a, b) => a.importedAt - b.importedAt);
}

export async function deleteSnapshot(id: number): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

export async function clearSnapshots(): Promise<void> {
  await run('readwrite', (store) => store.clear());
}
```
Note: if `noUnusedLocals` flags `_ignored`, replace the destructure with `const withoutId = { ...snapshot }; delete withoutId.id;`.

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test && npx tsc` → Expected: PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/storage/snapshotStore.ts tests/snapshotStore.test.ts
git commit -m "feat: store snapshots in IndexedDB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Categories and silent follows

**Files:**
- Create: `src/analysis/engagement.ts`, `src/analysis/categories.ts`
- Test: `tests/categories.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `Account`, `Engagement`; `LIST_LABELS` (Task 2).
- Produces:
  - `engagementTotal(e: Engagement | undefined): number`; `silentFollows(s: Snapshot): Account[]`
  - `type CategoryKey = 'nonFollowers' | 'unfollowedYou' | 'newFollowers' | 'fans' | 'mutuals' | 'silentFollows' | 'closeFriends' | 'restricted' | 'blocked' | 'pendingSent' | 'pendingReceived' | 'recentlyUnfollowedByYou'`
  - `interface Category { key: CategoryKey; label: string; description: string; accounts: Account[]; available: boolean; unavailableReason: string }`
  - `difference(a: Account[], b: Account[]): Account[]`; `intersection(a: Account[], b: Account[]): Account[]`
  - `computeCategories(current: Snapshot, previous: Snapshot | null): Category[]` — returned in the order listed in `CategoryKey`.

- [ ] **Step 1: Write the failing test — `tests/categories.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `../src/analysis/categories`.

- [ ] **Step 3: Implement `src/analysis/engagement.ts`**

```ts
import type { Account, Engagement, Snapshot } from '../types';

export function engagementTotal(e: Engagement | undefined): number {
  return e ? e.likes + e.comments + e.dmMessages : 0;
}

export function silentFollows(snapshot: Snapshot): Account[] {
  return snapshot.lists.following.filter(
    (account) => engagementTotal(snapshot.engagement[account.username.toLowerCase()]) === 0,
  );
}
```

- [ ] **Step 4: Implement `src/analysis/categories.ts`**

```ts
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
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm test && npx tsc` → Expected: PASS, tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/analysis tests/categories.test.ts
git commit -m "feat: compute follower categories, history diffs and silent follows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Trend series and SVG chart

**Files:**
- Create: `src/analysis/trend.ts`, `src/ui/chart.ts`
- Test: `tests/trend.test.ts`

**Interfaces:**
- Consumes: `difference` (Task 5), `Snapshot`.
- Produces: `interface TrendPoint { importedAt: number; followers: number; following: number; gained: number; lost: number }`; `buildTrend(snapshots: Snapshot[]): TrendPoint[]` (sorted ascending); `renderTrendSvg(points: TrendPoint[], width?: number, height?: number): string` — returns `''` for fewer than 2 points; output contains only numbers and fixed text.

- [ ] **Step 1: Write the failing test — `tests/trend.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildTrend } from '../src/analysis/trend';
import { renderTrendSvg } from '../src/ui/chart';
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
      { importedAt: 10, followers: 2, following: 0, gained: 0, lost: 0 },
      { importedAt: 20, followers: 3, following: 1, gained: 2, lost: 1 },
    ]);
  });
});

describe('renderTrendSvg', () => {
  it('returns an empty string with fewer than two points', () => {
    expect(renderTrendSvg([{ importedAt: 1, followers: 1, following: 1, gained: 0, lost: 0 }])).toBe('');
  });

  it('draws two polylines with min and max labels', () => {
    const svg = renderTrendSvg([
      { importedAt: 1, followers: 100, following: 50, gained: 0, lost: 0 },
      { importedAt: 2, followers: 120, following: 55, gained: 20, lost: 0 },
    ]);
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    expect(svg).toContain('>120<');
    expect(svg).toContain('>50<');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `../src/analysis/trend`.

- [ ] **Step 3: Implement `src/analysis/trend.ts`**

```ts
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
```

- [ ] **Step 4: Implement `src/ui/chart.ts`**

```ts
import type { TrendPoint } from '../analysis/trend';

export function renderTrendSvg(points: TrendPoint[], width = 320, height = 160): string {
  if (points.length < 2) return '';
  const pad = 24;
  const values = points.flatMap((p) => [p.followers, p.following]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (points.length - 1);
  const y = (v: number) => height - pad - ((v - min) * (height - 2 * pad)) / span;
  const line = (pick: (p: TrendPoint) => number) =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ');

  return (
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Followers and following over time">` +
    `<polyline class="line-followers" fill="none" points="${line((p) => p.followers)}"/>` +
    `<polyline class="line-following" fill="none" points="${line((p) => p.following)}"/>` +
    `<text class="axis" x="${pad}" y="14">${max}</text>` +
    `<text class="axis" x="${pad}" y="${height - 6}">${min}</text>` +
    `</svg>`
  );
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm test && npx tsc` → Expected: PASS, tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/analysis/trend.ts src/ui/chart.ts tests/trend.test.ts
git commit -m "feat: build follower trend series and SVG chart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Copy text and CSV export

**Files:**
- Create: `src/export/listExport.ts`
- Test: `tests/listExport.test.ts`

**Interfaces:**
- Produces: `toUsernameText(accounts: Account[]): string` (one per line); `toCsv(accounts: Account[]): string` (header `username,profile_url,date`, date `YYYY-MM-DD` or empty); `formatDate(unixSeconds: number): string`.

- [ ] **Step 1: Write the failing test — `tests/listExport.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatDate, toCsv, toUsernameText } from '../src/export/listExport';

const accounts = [
  { username: 'alice', href: 'https://www.instagram.com/alice', timestamp: 1700000000 },
  { username: 'bob', href: 'https://www.instagram.com/b,ob', timestamp: 0 },
];

describe('listExport', () => {
  it('joins usernames one per line', () => {
    expect(toUsernameText(accounts)).toBe('alice\nbob');
  });

  it('builds CSV with quoting and ISO dates', () => {
    expect(toCsv(accounts)).toBe(
      'username,profile_url,date\nalice,https://www.instagram.com/alice,2023-11-14\nbob,"https://www.instagram.com/b,ob",',
    );
  });

  it('formats unix seconds as YYYY-MM-DD', () => {
    expect(formatDate(1700000000)).toBe('2023-11-14');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `../src/export/listExport`.

- [ ] **Step 3: Implement `src/export/listExport.ts`**

```ts
import type { Account } from '../types';

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toUsernameText(accounts: Account[]): string {
  return accounts.map((a) => a.username).join('\n');
}

export function toCsv(accounts: Account[]): string {
  const rows = accounts.map((a) =>
    [a.username, a.href, a.timestamp ? formatDate(a.timestamp) : ''].map(csvCell).join(','),
  );
  return ['username,profile_url,date', ...rows].join('\n');
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test && npx tsc` → Expected: PASS, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/export tests/listExport.test.ts
git commit -m "feat: export account lists as text and CSV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: UI — renderer, app wiring, styles

**Files:**
- Create: `index.html`, `src/ui/render.ts`, `src/main.ts`, `src/style.css`
- Test: `tests/render.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `interface ViewState { snapshots: Snapshot[]; activeCategory: CategoryKey; query: string; status: string; error: string }`; `interface Handlers { onFiles(files: File[]): void; onSelectCategory(key: CategoryKey): void; onQuery(query: string): void; onCopy(accounts: Account[]): void; onCsv(category: Category): void; onDeleteSnapshot(id: number): void; onDeleteAll(): void }`; `renderApp(root: HTMLElement, state: ViewState, handlers: Handlers): void`; `filterAccounts(accounts: Account[], query: string): Account[]`.
- DOM hooks used by tests: chips are `button.chip[data-key]` (active one has class `active`), each chip's `.count` shows the count or `–` when unavailable; rows are `li.account-row`; search is `input.search`; list container is `.list-host`; onboarding is `section.onboarding`.

- [ ] **Step 1: Write the failing test — `tests/render.test.ts`**

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { filterAccounts, renderApp, type Handlers, type ViewState } from '../src/ui/render';
import type { Snapshot } from '../src/types';

const acc = (username: string) => ({ username, href: `https://www.instagram.com/${username}`, timestamp: 0 });
const snap = (id: number, followers: string[], following: string[]): Snapshot => ({
  id,
  importedAt: id,
  lists: {
    followers: followers.map(acc), following: following.map(acc), closeFriends: [], restricted: [], blocked: [],
    pendingSent: [], pendingReceived: [], recentlyUnfollowedByYou: [],
  },
  engagement: {},
  missing: [],
});

function handlers(): Handlers {
  return {
    onFiles: vi.fn(), onSelectCategory: vi.fn(), onQuery: vi.fn(), onCopy: vi.fn(),
    onCsv: vi.fn(), onDeleteSnapshot: vi.fn(), onDeleteAll: vi.fn(),
  };
}

function state(snapshots: Snapshot[]): ViewState {
  return { snapshots, activeCategory: 'nonFollowers', query: '', status: '', error: '' };
}

describe('filterAccounts', () => {
  it('matches substrings case-insensitively and ignores a leading @', () => {
    expect(filterAccounts([acc('alice'), acc('bob')], '@ALI').map((a) => a.username)).toEqual(['alice']);
  });
});

describe('renderApp', () => {
  it('shows onboarding when there are no snapshots', () => {
    const root = document.createElement('div');
    renderApp(root, state([]), handlers());
    expect(root.querySelector('section.onboarding')).not.toBeNull();
  });

  it('renders category counts and the active list', () => {
    const root = document.createElement('div');
    renderApp(root, state([snap(1, ['a'], ['a', 'b', 'c'])]), handlers());
    const chip = root.querySelector<HTMLButtonElement>('button.chip[data-key="nonFollowers"]')!;
    expect(chip.classList.contains('active')).toBe(true);
    expect(chip.querySelector('.count')!.textContent).toBe('2');
    expect(root.querySelector('button.chip[data-key="unfollowedYou"] .count')!.textContent).toBe('–');
    expect([...root.querySelectorAll('li.account-row a')].map((a) => a.textContent)).toEqual(['@b', '@c']);
  });

  it('uses the previous snapshot for unfollowed you', () => {
    const root = document.createElement('div');
    renderApp(root, { ...state([snap(1, ['a', 'b'], []), snap(2, ['a'], [])]), activeCategory: 'unfollowedYou' }, handlers());
    expect([...root.querySelectorAll('li.account-row a')].map((a) => a.textContent)).toEqual(['@b']);
  });

  it('calls onSelectCategory when a chip is clicked', () => {
    const root = document.createElement('div');
    const h = handlers();
    renderApp(root, state([snap(1, ['a'], ['b'])]), h);
    root.querySelector<HTMLButtonElement>('button.chip[data-key="fans"]')!.click();
    expect(h.onSelectCategory).toHaveBeenCalledWith('fans');
  });

  it('filters the list while typing without a full re-render', () => {
    const root = document.createElement('div');
    renderApp(root, state([snap(1, [], ['alice', 'bob'])]), handlers());
    const search = root.querySelector<HTMLInputElement>('input.search')!;
    search.value = 'bo';
    search.dispatchEvent(new Event('input'));
    expect([...root.querySelectorAll('li.account-row a')].map((a) => a.textContent)).toEqual(['@bob']);
  });

  it('renders usernames as text, not HTML', () => {
    const root = document.createElement('div');
    renderApp(root, state([snap(1, [], ['<img src=x onerror=alert(1)>'])]), handlers());
    expect(root.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `../src/ui/render`.

- [ ] **Step 3: Implement `src/ui/render.ts`**

```ts
import { computeCategories, type Category, type CategoryKey } from '../analysis/categories';
import { buildTrend } from '../analysis/trend';
import { formatDate } from '../export/listExport';
import type { Account, Snapshot } from '../types';
import { renderTrendSvg } from './chart';

export interface ViewState {
  snapshots: Snapshot[];
  activeCategory: CategoryKey;
  query: string;
  status: string;
  error: string;
}

export interface Handlers {
  onFiles(files: File[]): void;
  onSelectCategory(key: CategoryKey): void;
  onQuery(query: string): void;
  onCopy(accounts: Account[]): void;
  onCsv(category: Category): void;
  onDeleteSnapshot(id: number): void;
  onDeleteAll(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

export function filterAccounts(accounts: Account[], query: string): Account[] {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  return q ? accounts.filter((a) => a.username.toLowerCase().includes(q)) : accounts;
}

function renderHeader(h: Handlers): HTMLElement {
  const input = el('input', {
    type: 'file',
    accept: '.zip,.json,application/zip,application/json',
    multiple: true,
    id: 'file-input',
    className: 'visually-hidden',
  });
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    if (files.length > 0) h.onFiles(files);
    input.value = '';
  });
  return el('header', { className: 'app-header' }, [
    el('h1', { textContent: 'NonFollowers+' }),
    el('label', { htmlFor: 'file-input', className: 'button primary', textContent: 'Import export' }),
    input,
  ]);
}

function renderOnboarding(): HTMLElement {
  const steps = [
    'In Instagram, open Settings, then Accounts Center, then Your information and permissions, then Export your information. Menu names can vary slightly.',
    'Create an export to this device. Choose Some of your information and select Followers and following, Likes, Comments and Messages.',
    'Set the date range to All time and the format to JSON, then start the export.',
    'When Instagram notifies you, download the ZIP file. Tap Import export above and pick it.',
  ];
  return el('section', { className: 'onboarding card' }, [
    el('h2', { textContent: 'Get started' }),
    el('ol', {}, steps.map((text) => el('li', { textContent: text }))),
    el('p', {
      className: 'muted',
      textContent:
        'Everything is processed on this device. Your export is never uploaded. Import again every week or two to track who unfollowed you.',
    }),
  ]);
}

function stat(label: string, value: number): HTMLElement {
  return el('div', { className: 'stat card' }, [
    el('span', { className: 'stat-value', textContent: value.toLocaleString() }),
    el('span', { className: 'stat-label', textContent: label }),
  ]);
}

function renderTrend(snapshots: Snapshot[]): HTMLElement | null {
  const points = buildTrend(snapshots);
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const chart = el('div', { className: 'chart' });
  chart.innerHTML = renderTrendSvg(points);
  return el('section', { className: 'card' }, [
    el('h2', { textContent: 'Trend' }),
    chart,
    el('p', { className: 'legend' }, [
      el('span', { className: 'key key-followers', textContent: 'Followers' }),
      el('span', { className: 'key key-following', textContent: 'Following' }),
    ]),
    el('p', {
      className: 'muted',
      textContent: `Since previous import: +${last.gained} gained, -${last.lost} lost.`,
    }),
  ]);
}

function renderRow(account: Account): HTMLElement {
  const children: Array<Node | string> = [
    el('a', {
      href: account.href,
      target: '_blank',
      rel: 'noopener noreferrer',
      className: 'username',
      textContent: `@${account.username}`,
    }),
  ];
  if (account.timestamp) children.push(el('span', { className: 'meta', textContent: formatDate(account.timestamp) }));
  return el('li', { className: 'account-row' }, children);
}

function renderList(category: Category, query: string): HTMLElement {
  if (!category.available) return el('p', { className: 'empty', textContent: category.unavailableReason });
  const accounts = filterAccounts(category.accounts, query);
  if (accounts.length === 0) return el('p', { className: 'empty', textContent: query ? 'No matches.' : 'Nobody here.' });
  return el('ul', { className: 'account-list' }, accounts.map(renderRow));
}

function renderCategories(categories: Category[], state: ViewState, h: Handlers): HTMLElement[] {
  const active = categories.find((c) => c.key === state.activeCategory) ?? categories[0];

  const chips = el(
    'nav',
    { className: 'chips' },
    categories.map((c) => {
      const chip = el('button', { type: 'button', className: c.key === active.key ? 'chip active' : 'chip' }, [
        el('span', { textContent: c.label }),
        el('span', { className: 'count', textContent: c.available ? String(c.accounts.length) : '–' }),
      ]);
      chip.dataset.key = c.key;
      chip.addEventListener('click', () => h.onSelectCategory(c.key));
      return chip;
    }),
  );

  const listHost = el('div', { className: 'list-host' }, [renderList(active, state.query)]);
  const search = el('input', { type: 'search', placeholder: 'Search usernames', value: state.query, className: 'search' });
  search.addEventListener('input', () => {
    h.onQuery(search.value);
    listHost.replaceChildren(renderList(active, search.value));
  });

  const empty = !active.available || active.accounts.length === 0;
  const copy = el('button', { type: 'button', className: 'button', textContent: 'Copy usernames', disabled: empty });
  copy.addEventListener('click', () => h.onCopy(filterAccounts(active.accounts, search.value)));
  const csv = el('button', { type: 'button', className: 'button', textContent: 'Export CSV', disabled: empty });
  csv.addEventListener('click', () => h.onCsv(active));

  return [
    chips,
    el('section', { className: 'card' }, [
      el('h2', { textContent: active.label }),
      el('p', { className: 'muted', textContent: active.description }),
      el('div', { className: 'actions' }, [search, copy, csv]),
      listHost,
    ]),
  ];
}

function renderHistory(snapshots: Snapshot[], h: Handlers): HTMLElement {
  const rows = [...snapshots].reverse().map((s) => {
    const remove = el('button', { type: 'button', className: 'button subtle', textContent: 'Delete' });
    remove.addEventListener('click', () => h.onDeleteSnapshot(s.id!));
    return el('li', { className: 'history-row' }, [
      el('span', {
        textContent: `${new Date(s.importedAt).toLocaleString()} · ${s.lists.followers.length} followers · ${s.lists.following.length} following`,
      }),
      remove,
    ]);
  });
  const clearAll = el('button', { type: 'button', className: 'button danger', textContent: 'Delete all data' });
  clearAll.addEventListener('click', () => h.onDeleteAll());
  return el('section', { className: 'card' }, [
    el('h2', { textContent: 'Imports on this device' }),
    el('ul', { className: 'history' }, rows),
    clearAll,
  ]);
}

function renderDashboard(state: ViewState, h: Handlers): HTMLElement[] {
  const latest = state.snapshots[state.snapshots.length - 1];
  const previous = state.snapshots[state.snapshots.length - 2] ?? null;
  const categories = computeCategories(latest, previous);
  const count = (key: CategoryKey) => categories.find((c) => c.key === key)!.accounts.length;

  const nodes: HTMLElement[] = [];
  if (latest.missing.length > 0) {
    nodes.push(
      el('p', {
        className: 'notice',
        textContent: `Missing or incomplete in this export: ${latest.missing.join(', ')}. Related tabs are limited.`,
      }),
    );
  }
  nodes.push(
    el('section', { className: 'stats' }, [
      stat('Followers', latest.lists.followers.length),
      stat('Following', latest.lists.following.length),
      stat('Mutuals', count('mutuals')),
      stat("Don't follow back", count('nonFollowers')),
    ]),
  );
  const trend = renderTrend(state.snapshots);
  if (trend) nodes.push(trend);
  nodes.push(...renderCategories(categories, state, h), renderHistory(state.snapshots, h));
  return nodes;
}

export function renderApp(root: HTMLElement, state: ViewState, h: Handlers): void {
  const nodes: HTMLElement[] = [renderHeader(h)];
  if (state.status) nodes.push(el('p', { className: 'status', textContent: state.status }));
  if (state.error) nodes.push(el('p', { className: 'error', textContent: state.error }));
  nodes.push(...(state.snapshots.length > 0 ? renderDashboard(state, h) : [renderOnboarding()]));
  root.replaceChildren(...nodes);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm test && npx tsc` → Expected: PASS, tsc exit 0.

- [ ] **Step 5: `src/main.ts`**

```ts
import './style.css';
import { toCsv, toUsernameText } from './export/listExport';
import { parseExport } from './parse/parseExport';
import { readInput } from './parse/readInput';
import { clearSnapshots, deleteSnapshot, listSnapshots, saveSnapshot } from './storage/snapshotStore';
import { renderApp, type Handlers, type ViewState } from './ui/render';

const root = document.getElementById('app')!;
const state: ViewState = { snapshots: [], activeCategory: 'nonFollowers', query: '', status: '', error: '' };

function render(): void {
  renderApp(root, state, handlers);
}

async function reload(): Promise<void> {
  state.snapshots = await listSnapshots();
  render();
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const handlers: Handlers = {
  async onFiles(files) {
    state.status = 'Reading export…';
    state.error = '';
    render();
    try {
      const snapshot = parseExport(await readInput(files), Date.now());
      await saveSnapshot(snapshot);
      state.status = '';
      await reload();
    } catch (err) {
      state.status = '';
      state.error = err instanceof Error ? err.message : String(err);
      render();
    }
  },
  onSelectCategory(key) {
    state.activeCategory = key;
    state.query = '';
    state.status = '';
    render();
  },
  onQuery(query) {
    state.query = query;
  },
  async onCopy(accounts) {
    try {
      await navigator.clipboard.writeText(toUsernameText(accounts));
      state.status = `Copied ${accounts.length} usernames.`;
    } catch {
      state.error = 'Copy failed. Use Export CSV instead.';
    }
    render();
  },
  onCsv(category) {
    download(`${category.key}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(category.accounts));
  },
  async onDeleteSnapshot(id) {
    if (!confirm('Delete this import?')) return;
    await deleteSnapshot(id);
    await reload();
  },
  async onDeleteAll() {
    if (!confirm('Delete all imports stored on this device?')) return;
    await clearSnapshots();
    await reload();
  },
};

void navigator.storage?.persist?.();
reload().catch((err) => {
  state.error = `Could not open on-device storage: ${String(err)}`;
  render();
});
```

- [ ] **Step 6: `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0b0b0f" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="NonFollowers+" />
    <link rel="apple-touch-icon" href="%BASE_URL%apple-touch-icon.png" />
    <link rel="icon" type="image/svg+xml" href="%BASE_URL%icon.svg" />
    <title>NonFollowers+</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: `src/style.css`**

```css
:root {
  --bg: #0b0b0f;
  --surface: #16161d;
  --border: #26262f;
  --text: #f4f4f5;
  --muted: #a1a1aa;
  --accent: #e1306c;
  --accent-2: #7c9cff;
  --danger: #f87171;
  color-scheme: dark;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  -webkit-text-size-adjust: 100%;
}

#app {
  max-width: 640px;
  margin: 0 auto;
  padding: calc(env(safe-area-inset-top) + 12px) 16px calc(env(safe-area-inset-bottom) + 24px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h1 { font-size: 22px; margin: 0; }
h2 { font-size: 17px; margin: 0 0 6px; }

.app-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
}

.muted, .meta, .stat-label { color: var(--muted); font-size: 14px; }

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.button.subtle { min-height: 36px; font-size: 14px; }
.button.danger { color: var(--danger); margin-top: 10px; width: 100%; }
.button:disabled { opacity: 0.4; cursor: default; }

.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

.status { color: var(--accent-2); margin: 0; }
.error, .notice { margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 14px; }
.error { background: rgba(248, 113, 113, 0.12); color: var(--danger); }
.notice { background: rgba(124, 156, 255, 0.1); color: var(--muted); }

.onboarding ol { padding-left: 20px; line-height: 1.5; }

.stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.stat { display: flex; flex-direction: column; gap: 2px; }
.stat-value { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }

.chart svg { width: 100%; height: auto; display: block; }
.line-followers { stroke: var(--accent); stroke-width: 2.5; }
.line-following { stroke: var(--accent-2); stroke-width: 2.5; }
.axis { fill: var(--muted); font-size: 11px; }
.legend { display: flex; gap: 16px; font-size: 13px; margin: 8px 0 0; }
.key::before { content: ''; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
.key-followers::before { background: var(--accent); }
.key-following::before { background: var(--accent-2); }

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex: none;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}
.chip.active { background: var(--text); color: var(--bg); border-color: var(--text); }
.count { font-variant-numeric: tabular-nums; opacity: 0.7; }

.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.search {
  flex: 1 1 100%;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 16px;
}

.account-list, .history { list-style: none; margin: 0; padding: 0; }
.account-row, .history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  border-top: 1px solid var(--border);
}
.history-row { font-size: 14px; }
.username { color: var(--text); text-decoration: none; font-weight: 500; overflow-wrap: anywhere; }
.empty { color: var(--muted); margin: 12px 0 0; }
```

- [ ] **Step 8: Smoke check in dev server**

Run: `npx vite --host 127.0.0.1 --port 5173` in the background, then `curl -s http://127.0.0.1:5173/nonfollowers-plus/ | grep -c 'id="app"'` → Expected: `1` (only after Task 9 sets `base`; before that use `http://127.0.0.1:5173/`). Stop the server afterwards.

- [ ] **Step 9: Commit**

```bash
git add index.html src/ui/render.ts src/main.ts src/style.css tests/render.test.ts
git commit -m "feat: add app UI with categories, search, export and history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: PWA manifest, service worker, icons

**Files:**
- Create: `vite.config.ts`, `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
- Modify: `tsconfig.json` (add `vite-plugin-pwa/client` to `types`)

**Interfaces:**
- Produces: `npm run build` outputs `dist/` with `manifest.webmanifest`, `sw.js`, and precached assets under base `/nonfollowers-plus/`.

- [ ] **Step 1: `public/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0b0b0f"/>
  <circle cx="206" cy="200" r="74" fill="none" stroke="#f4f4f5" stroke-width="28"/>
  <path d="M86 404c14-70 62-110 120-110s106 40 120 110" fill="none" stroke="#f4f4f5" stroke-width="28" stroke-linecap="round"/>
  <path d="M390 150v112M334 206h112" stroke="#e1306c" stroke-width="32" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: Generate PNG icons (opaque background, iOS needs no transparency)**

```bash
cd ~/nonfollowers-plus/public
convert -background '#0b0b0f' -density 300 icon.svg -resize 512x512 -flatten icon-512.png
convert -background '#0b0b0f' -density 300 icon.svg -resize 192x192 -flatten icon-192.png
convert -background '#0b0b0f' -density 300 icon.svg -resize 180x180 -flatten apple-touch-icon.png
identify icon-512.png icon-192.png apple-touch-icon.png
```
Expected: three PNG lines with sizes 512x512, 192x192, 180x180. Open `icon-512.png` with the Read tool and confirm the person glyph and pink plus are visible.

- [ ] **Step 3: `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/nonfollowers-plus/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'NonFollowers+',
        short_name: 'NonFollowers+',
        description: 'See who does not follow you back, who unfollowed you, and more. Runs entirely on your device.',
        theme_color: '#0b0b0f',
        background_color: '#0b0b0f',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
});
```

Add `"vite-plugin-pwa/client"` to `compilerOptions.types` in `tsconfig.json` so it reads `"types": ["vite/client", "vite-plugin-pwa/client"]`.

- [ ] **Step 4: Build and verify output**

Run: `npm test && npm run build`
Expected: tests pass, build succeeds, and output lists `dist/sw.js` and `dist/manifest.webmanifest`.
Run: `grep -o '/nonfollowers-plus/[a-z-]*\.png' dist/index.html` → Expected: `/nonfollowers-plus/apple-touch-icon.png`.
Run: `grep -c 'registerSW\|serviceWorker' dist/index.html dist/assets/*.js | grep -v ':0'` → Expected: at least one match (registration script is injected).

- [ ] **Step 5: Preview check**

Run `npx vite preview --host 127.0.0.1 --port 4173` in the background, then `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/nonfollowers-plus/sw.js` → Expected: `200`. Stop the preview server.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts tsconfig.json public package.json package-lock.json
git commit -m "feat: make the app an installable offline PWA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Deploy to GitHub Pages

**This task creates a public repository under the user's GitHub account. Confirm with the user before running Step 3.**

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit and rename branch**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: deploy to GitHub Pages on push to main

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git branch -M main
```

- [ ] **Step 3: Create repo, enable Pages, push (after user confirmation)**

```bash
gh repo create basedalgerianrin/nonfollowers-plus --public --source . --remote origin --description "Free, on-device Instagram follower analysis PWA"
gh api -X POST repos/basedalgerianrin/nonfollowers-plus/pages -f build_type=workflow
git push -u origin main
```

- [ ] **Step 4: Verify deployment**

Run: `gh run watch --repo basedalgerianrin/nonfollowers-plus --exit-status $(gh run list --repo basedalgerianrin/nonfollowers-plus --limit 1 --json databaseId -q '.[0].databaseId')`
Expected: build and deploy jobs succeed.
Run: `curl -s -o /dev/null -w '%{http_code}' https://basedalgerianrin.github.io/nonfollowers-plus/` → Expected: `200`.
Run: `curl -s -o /dev/null -w '%{http_code}' https://basedalgerianrin.github.io/nonfollowers-plus/sw.js` → Expected: `200`.

---

### Task 11: On-device check (user)

- [ ] Open `https://basedalgerianrin.github.io/nonfollowers-plus/` in Safari on the iPhone → Share → Add to Home Screen.
- [ ] Launch from the home screen icon: it opens full-screen with no Safari bars.
- [ ] Import a real Instagram JSON export ZIP. Check the counts against the Instagram app (followers and following).
- [ ] Turn on Airplane Mode, force-quit the app, reopen it: it loads and still shows the stored import.
- [ ] Copy usernames and Export CSV both work.
- [ ] Report any file names listed in the "Not in this export" notice, so the parser patterns can be adjusted for your export version.
