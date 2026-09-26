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
