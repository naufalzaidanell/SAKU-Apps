import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const KBLI_VERSION = 'KBLI2025';
export const KBLI_EXPECTED_COUNT = 1559;
export const KBLI_DATASET_SHA256 = 'f8efef8e961d55ed85c755fd2f2dfd1e93a20f1518120e9ea19cb99d78da8ba1';
export const KBLI_SOURCE = 'service:reference-data/kbli2025.json';

export async function loadPinnedDataset(url = new URL('./reference-data/kbli2025.json', import.meta.url)) {
  const bytes = await readFile(url);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== KBLI_DATASET_SHA256) throw new Error('KBLI_DATASET_DIGEST_MISMATCH');
  const raw = JSON.parse(bytes.toString('utf8'));
  if (raw.version !== KBLI_VERSION || !Array.isArray(raw.entries) || raw.entries.length !== KBLI_EXPECTED_COUNT) {
    throw new Error('KBLI_DATASET_INVALID');
  }
  if (new Set(raw.entries.map(entry => entry.code)).size !== KBLI_EXPECTED_COUNT
      || raw.entries[0]?.code !== '01111' || raw.entries.at(-1)?.code !== '99000') {
    throw new Error('KBLI_DATASET_GATE_FAILED');
  }
  return raw;
}
