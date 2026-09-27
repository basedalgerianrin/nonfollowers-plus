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
  document.body.appendChild(link);
  link.click();
  link.remove();
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
    const filename = `nonfollowers-${category.key}-${new Date().toISOString().slice(0, 10)}.csv`;
    const csv = toCsv(category.accounts);
    const file = new File([csv], filename, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        state.error = err instanceof Error ? err.message : String(err);
        render();
      });
      return;
    }
    download(filename, csv);
  },
  async onDeleteSnapshot(id) {
    if (!confirm('Delete this import?')) return;
    try {
      await deleteSnapshot(id);
      await reload();
    } catch (err) {
      state.error = `Could not delete this import: ${err instanceof Error ? err.message : String(err)}`;
      render();
    }
  },
  async onDeleteAll() {
    if (!confirm('Delete all imports stored on this device?')) return;
    try {
      await clearSnapshots();
      await reload();
    } catch (err) {
      state.error = `Could not delete stored imports: ${err instanceof Error ? err.message : String(err)}`;
      render();
    }
  },
};

void navigator.storage?.persist?.();
reload().catch((err) => {
  state.error = `Could not open on-device storage: ${String(err)}`;
  render();
});
