/**
 * NeverSoft Services — SKU System
 * Files get IDs like NS-2026-05-0001 and magnetically cluster with related files.
 */
import { db } from './db';
import type { GKFile, GKSKUCluster } from './db';

let _counter = 0;

/** Generate a new unique SKU: NS-YYYY-MM-XXXX */
export function generateSKU(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  _counter = (_counter + 1) % 10000;
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `NS-${year}-${month}-${seq}`;
}

/** Link two SKUs together (creates/updates a cluster) */
export async function linkSKUs(skuA: string, skuB: string): Promise<void> {
  const existing = await db.skuClusters
    .filter(c => c.memberSkus.includes(skuA) || c.memberSkus.includes(skuB))
    .first();

  if (existing) {
    const merged = Array.from(new Set([...existing.memberSkus, skuA, skuB]));
    await db.skuClusters.update(existing.id!, { memberSkus: merged });
  } else {
    await db.skuClusters.add({
      rootSku: skuA,
      memberSkus: [skuA, skuB],
      label: `Cluster: ${skuA}`,
      createdAt: Date.now(),
    });
  }

  // Update files' skuLinks arrays
  await db.transaction('rw', db.files, async () => {
    const fileA = await db.files.where('sku').equals(skuA).first();
    const fileB = await db.files.where('sku').equals(skuB).first();

    if (fileA?.id && !fileA.skuLinks.includes(skuB)) {
      await db.files.update(fileA.id, { skuLinks: [...fileA.skuLinks, skuB] });
    }
    if (fileB?.id && !fileB.skuLinks.includes(skuA)) {
      await db.files.update(fileB.id, { skuLinks: [...fileB.skuLinks, skuA] });
    }
  });
}

/** Get all files in the same SKU cluster as the given SKU */
export async function getClusterFiles(sku: string): Promise<GKFile[]> {
  const cluster = await db.skuClusters
    .filter(c => c.memberSkus.includes(sku))
    .first();

  if (!cluster) return [];

  const files = await Promise.all(
    cluster.memberSkus.map(s => db.files.where('sku').equals(s).first())
  );

  return files.filter((f): f is GKFile => !!f);
}

/** Get all clusters */
export async function getAllClusters(): Promise<GKSKUCluster[]> {
  return db.skuClusters.orderBy('createdAt').reverse().toArray();
}

/** Auto-link files with similar tags (magnetism) */
export async function autoMagnetize(fileId: number): Promise<string[]> {
  const file = await db.files.get(fileId);
  if (!file) return [];

  const linked: string[] = [];
  const whoTags = file.tags.filter(t => t.dimension === 'who').map(t => t.value.toLowerCase());
  const whereTags = file.tags.filter(t => t.dimension === 'where').map(t => t.value.toLowerCase());

  if (whoTags.length === 0 && whereTags.length === 0) return [];

  // Find files with matching 'who' or 'where' tags (excluding this file)
  const candidates = await db.files
    .filter(f => f.id !== fileId && f.sku !== file.sku)
    .toArray();

  for (const candidate of candidates) {
    const cWho = candidate.tags.filter(t => t.dimension === 'who').map(t => t.value.toLowerCase());
    const cWhere = candidate.tags.filter(t => t.dimension === 'where').map(t => t.value.toLowerCase());

    const whoMatch = whoTags.some(w => cWho.includes(w));
    const whereMatch = whereTags.some(w => cWhere.includes(w));

    if (whoMatch || whereMatch) {
      await linkSKUs(file.sku, candidate.sku);
      linked.push(candidate.sku);
    }
  }

  return linked;
}

/** Parse a SKU string for display */
export function parseSKU(sku: string): { year: string; month: string; seq: string } | null {
  const match = sku.match(/^(?:NS|GK)-(\d{4})-(\d{2})-(\w+)$/);
  if (!match) return null;
  return { year: match[1], month: match[2], seq: match[3] };
}
