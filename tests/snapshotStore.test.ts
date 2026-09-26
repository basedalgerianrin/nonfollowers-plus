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
