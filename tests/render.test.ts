// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { filterAccounts, renderApp, type Handlers, type ViewState } from '../src/ui/render';
import { LIST_LABELS } from '../src/parse/parseExport';
import type { Snapshot } from '../src/types';

const acc = (username: string) => ({ username, href: `https://www.instagram.com/${username}`, timestamp: 0 });
const snap = (id: number, followers: string[], following: string[], missing: string[] = []): Snapshot => ({
  id,
  importedAt: id,
  lists: {
    followers: followers.map(acc), following: following.map(acc), closeFriends: [], restricted: [], blocked: [],
    pendingSent: [], pendingReceived: [], recentlyUnfollowedByYou: [],
  },
  engagement: {},
  missing,
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

  it('shows an en dash on a stat tile whose category is unavailable', () => {
    const root = document.createElement('div');
    renderApp(root, state([snap(1, ['a'], ['a', 'b'], [LIST_LABELS.followers])]), handlers());
    const stats = [...root.querySelectorAll('.stat')];
    const mutuals = stats.find((s) => s.querySelector('.stat-label')?.textContent === 'Mutuals');
    expect(mutuals?.querySelector('.stat-value')?.textContent).toBe('–');
    const nonFollowers = stats.find((s) => s.querySelector('.stat-label')?.textContent === "Don't follow back");
    expect(nonFollowers?.querySelector('.stat-value')?.textContent).toBe('–');
  });

  it('marks the status and error messages as live regions', () => {
    const statusRoot = document.createElement('div');
    renderApp(statusRoot, { ...state([]), status: 'Reading export…' }, handlers());
    const status = statusRoot.querySelector('p.status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');

    const errorRoot = document.createElement('div');
    renderApp(errorRoot, { ...state([]), error: 'Something went wrong.' }, handlers());
    const error = errorRoot.querySelector('p.error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.getAttribute('aria-live')).toBe('polite');
  });

  it('gives the search input an accessible label', () => {
    const root = document.createElement('div');
    renderApp(root, state([snap(1, [], ['alice'])]), handlers());
    const search = root.querySelector<HTMLInputElement>('input.search')!;
    expect(search.getAttribute('aria-label')).toBe('Search usernames');
  });
});
