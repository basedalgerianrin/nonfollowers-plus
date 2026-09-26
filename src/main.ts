import './style.css';
import { toCsv, toUsernameText } from './export/listExport';
import { parseExport } from './parse/parseExport';
import { readInput } from './parse/readInput';
import { clearSnapshots, deleteSnapshot, listSnapshots, saveSnapshot } from './storage/snapshotStore';
import { renderApp, type Handlers, type ViewState } from './ui/render';

const root = document.getElementById('app')!;
const state: ViewState = { snapshots: [], activeCategory: 'nonFollowers', query: '', status: '', error: '' };

function render(): void {
  renderApp(root, state, handlers);
}

async function reload(): Promise<void> {
  state.snapshots = await listSnapshots();
  render();
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const handlers: Handlers = {
  async onFiles(files) {
    state.status = 'Reading export…';
    state.error = '';
    render();
    try {
      const snapshot = parseExport(await readInput(files), Date.now());
      await saveSnapshot(snapshot);
      state.status = '';
      await reload();
    } catch (err) {
      state.status = '';
      state.error = err instanceof Error ? err.message : String(err);
      render();
    }
  },
  onSelectCategory(key) {
    state.activeCategory = key;
    state.query = '';
    state.status = '';
    render();
  },
  onQuery(query) {
    state.query = query;
  },
  async onCopy(accounts) {
    try {
      await navigator.clipboard.writeText(toUsernameText(accounts));
      state.status = `Copied ${accounts.length} usernames.`;
    } catch {
      state.error = 'Copy failed. Use Export CSV instead.';
    }
    render();
  },
  onCsv(category) {
    download(`${category.key}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(category.accounts));
  },
  async onDeleteSnapshot(id) {
    if (!confirm('Delete this import?')) return;
    await deleteSnapshot(id);
    await reload();
  },
  async onDeleteAll() {
    if (!confirm('Delete all imports stored on this device?')) return;
    await clearSnapshots();
    await reload();
  },
};

void navigator.storage?.persist?.();
reload().catch((err) => {
  state.error = `Could not open on-device storage: ${String(err)}`;
  render();
});
