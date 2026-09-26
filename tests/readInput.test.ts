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

    const result = await readInput([new File([bytes.buffer as ArrayBuffer], 'instagram-export.zip')]);
    expect([...result.keys()]).toEqual(['connections/followers_and_following/followers_1.json']);
    expect(result.get('connections/followers_and_following/followers_1.json')).toBe('[]');
  });

  it('accepts loose json files keyed by name', async () => {
    const result = await readInput([new File(['{"a":[]}'], 'following.json'), new File(['x'], 'notes.txt')]);
    expect([...result.entries()]).toEqual([['following.json', '{"a":[]}']]);
  });
});
