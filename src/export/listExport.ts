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
