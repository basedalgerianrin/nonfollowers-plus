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
  it('skips malformed entries with non-string values', () => {
    expect(toAccount({ title: 42, string_list_data: [{ value: 7, href: 99, timestamp: 'x' }] })).toBeNull();
  });
  it('handles non-array string_list_data by falling back to title and timestamp 0', () => {
    expect(toAccount({ string_list_data: 'nope', title: 'alice' })).toEqual({
      username: 'alice',
      href: 'https://www.instagram.com/alice',
      timestamp: 0,
    });
  });
});
