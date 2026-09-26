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
