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
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const first = Array.isArray(raw.string_list_data) && raw.string_list_data[0] && typeof raw.string_list_data[0] === 'object' ? raw.string_list_data[0] : {};
  const href = str(first.href);
  const username = (str(first.value) || str(raw.title) || usernameFromHref(href)).trim();
  if (!username) return null;
  return {
    username,
    href: INSTAGRAM_URL.test(href) ? href : `https://www.instagram.com/${encodeURIComponent(username)}`,
    timestamp: typeof first.timestamp === 'number' ? first.timestamp : 0,
  };
}
