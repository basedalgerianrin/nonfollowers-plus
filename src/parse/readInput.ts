import JSZip from 'jszip';
import { isRelevantPath } from './parseExport';

export async function readInput(files: File[]): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && isRelevantPath(entry.name)) {
          contents.set(entry.name, await entry.async('string'));
        }
      }
    } else if (name.endsWith('.json')) {
      contents.set(file.name, await file.text());
    }
  }
  return contents;
}
