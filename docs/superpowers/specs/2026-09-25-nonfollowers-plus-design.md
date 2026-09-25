# NonFollowers+ — Design Spec (V1)

Date: 2026-09-25
Status: Approved for implementation

## 1. Purpose

A free, self-built replacement for the paywalled "Nonfollowers" iPhone app. Parses the
user's own Instagram data export (JSON format) to show follower/following relationship
breakdowns, in more detail than the original app, with zero paywall and zero data leaving
the user's device.

## 2. Non-goals (V1)

- No "who viewed my profile" — Instagram never exposes this data to anyone, in or out of
  an export. Not building anything that implies it does.
- No automated live "is this account deactivated" checker — not reliably buildable
  client-side (CORS blocks reading cross-origin response status; bulk profile requests
  from a phone would likely get rate-limited/blocked by Instagram anyway). Deferred; see
  §7.
- No native app build — no Mac / Apple Developer account available. PWA only.
- No backend, database, or server-side storage of any kind.

## 3. Architecture

- **Frontend:** Vite + TypeScript, no framework (single-view app with tabs/filters —
  doesn't need component-framework overhead). Plain functions render each list ("profile
  row" renderer reused across tabs).
- **ZIP parsing:** JSZip, vendored locally (not CDN-loaded) so the installed PWA works
  fully offline.
- **Persistence:** IndexedDB, on-device only. Stores timestamped snapshots (see §6). No
  data ever leaves the browser — the app makes zero network requests at runtime beyond
  loading its own static assets.
- **Hosting:** Static files pushed to a public GitHub repo (`basedalgerianrin`), served
  via **GitHub Pages** (`https://basedalgerianrin.github.io/<repo>/`). Chosen over
  self-hosting on the homelab specifically so the app doesn't depend on the user's PC/WSL
  being on — GitHub Pages is always-on and reachable from any network. Real HTTPS cert,
  no self-signed-cert/iOS-trust workaround needed.
- **Install:** open the GitHub Pages URL once in mobile Safari → "Add to Home Screen".
  `manifest.json` + a precaching service worker cache the full app shell, so after that
  first load the installed app works completely offline — including future opens with no
  internet connection at all, since there's nothing to fetch at runtime.
- **Updates:** pushing new code to the repo updates the GitHub Pages deployment; the
  service worker picks up the new version next time the phone has connectivity and the
  app is opened (standard service-worker update-on-reload pattern).

## 4. Data Input

User exports their Instagram data (Settings → Accounts Center → Your information and
permissions → Download your information → **JSON** format), gets a `.zip`, and picks it
via a file input in the app. Parsing happens entirely client-side.

**Files read** (matched by filename pattern inside the ZIP, not a hardcoded path, since
Instagram's folder structure shifts slightly between export versions):
- `followers_1.json`, `following.json` — core follow graph
- `close_friends.json`, `restricted_profiles.json`, `blocked_profiles.json`
- `pending_follow_requests.json`, `recent_follow_requests.json`
- `recently_unfollowed_profiles.json`
- `liked_posts.json`, `post_comments.json` — engagement scoring input
- `story_activities.json` (or export's equivalent story-interaction file) — stalker-signal
  input

If an expected file isn't found, the app shows an in-UI notice naming which category is
running on partial data — never silently produces a number from missing input.

**Output:** one normalized snapshot — every account seen, tagged with which source list(s)
it appeared in, plus interaction tallies. Every feature below reads from this snapshot.

## 5. Features (V1)

Tabs/categories, all computed from the current snapshot unless noted as history-based:

1. **Non-followers** — you follow them, they don't follow you
2. **Fans** — they follow you, you don't follow them
3. **Mutuals**
4. **Blocked**, **Restricted**, **Close Friends** — direct from export
5. **Pending (sent)** / **Requested (received)**
6. **Recently unfollowed (by you)** — direct from Instagram's own file
7. **Unfollowed You** *(history-based, §6)* — was in your followers on the previous
   snapshot, isn't now
8. **New Followers** *(history-based, §6)*
9. **Engagement score / "silent follows"** — accounts you follow with zero recorded
   interaction (likes/comments/story activity) in either direction
10. **Potential stalkers** — accounts that view most/all of your stories but don't follow
    you back (explicitly the honest, data-backed version — not a "profile viewer" claim)

Every list gets a **copy usernames** / **export as CSV** action.

## 6. History & Trend Charts

Each import writes a timestamped snapshot to IndexedDB: `{ timestamp, accounts: [...],
counts: {...} }`. On a new import, the app diffs the current followers set against the
**most recent prior** snapshot to produce "Unfollowed You" / "New Followers". A trend
chart (line graph) plots follower/following counts and follow/unfollow event counts across
all stored snapshots.

First-ever import has no prior snapshot to diff against — the app shows an explicit "not
enough history yet, import again later to see changes" state for the history-based tabs
rather than a misleading zero.

## 7. Deferred to a later version

- Live deactivation/deletion status checking (would need a small opt-in "open profile in
  new tab to verify" affordance at minimum, or a self-hosted proxy if the user later wants
  automated bulk checking — not built in V1).
- Anything beyond the feature list in §5.

## 8. Testing

- Unit-level: parser functions tested against a small synthetic fixture ZIP covering
  normal cases, missing-file cases, and the "no prior snapshot" first-import case.
- Manual: full flow tested in real mobile Safari on the user's iPhone — install via Add to
  Home Screen, import a real export, verify offline relaunch works with no network.
