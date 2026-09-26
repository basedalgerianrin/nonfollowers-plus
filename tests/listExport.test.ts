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
