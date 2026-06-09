/**
 * NeverSoft Services — Seed / Demo Data
 * Populates the app with realistic sample data on first launch.
 * Only runs if the database is empty.
 */
import { db } from './db';
import type { GKFile } from './db';

const DEMO_FILES: Array<Omit<GKFile, 'id'>> = [
  {
    sku: 'NS-2026-03-1042',
    name: 'Sarah_Johnson_profile.jpg',
    ext: 'jpg',
    size: 2_415_919,
    mimeType: 'image/jpeg',
    tags: [
      { dimension: 'who', value: 'Sarah Johnson' },
      { dimension: 'what', value: 'Image' },
      { dimension: 'when', value: 'Mar 2026' },
      { dimension: 'where', value: 'Instagram' },
    ],
    skuLinks: ['NS-2026-03-2088', 'NS-2026-04-5531'],
    bundleIds: [],
    source: 'Instagram',
    content: undefined,
    createdAt: new Date('2026-03-15').getTime(),
    modifiedAt: new Date('2026-03-15').getTime(),
    importedAt: new Date('2026-03-16').getTime(),
    isFlagged: false,
    isPinned: true,
  },
  {
    sku: 'NS-2026-03-2088',
    name: 'snapchat_export_march.zip',
    ext: 'zip',
    size: 14_891_520,
    mimeType: 'application/zip',
    tags: [
      { dimension: 'who', value: 'Sarah Johnson' },
      { dimension: 'what', value: 'Archive' },
      { dimension: 'when', value: 'Mar 2026' },
      { dimension: 'where', value: 'Snapchat' },
    ],
    skuLinks: ['NS-2026-03-1042'],
    bundleIds: [],
    source: 'Snapchat',
    content: undefined,
    createdAt: new Date('2026-03-10').getTime(),
    modifiedAt: new Date('2026-03-10').getTime(),
    importedAt: new Date('2026-03-16').getTime(),
    isFlagged: true,
    isPinned: false,
  },
  {
    sku: 'NS-2026-04-5531',
    name: 'icloud_backup_2026-04.db',
    ext: 'db',
    size: 52_428_800,
    mimeType: 'application/octet-stream',
    tags: [
      { dimension: 'who', value: 'Sarah Johnson' },
      { dimension: 'what', value: 'Database' },
      { dimension: 'when', value: 'Apr 2026' },
      { dimension: 'where', value: 'iCloud' },
    ],
    skuLinks: ['NS-2026-03-1042'],
    bundleIds: [],
    source: 'iCloud',
    content: `Sarah Johnson
Phone: +1 (555) 234-5678
Email: sarah.j@example.com
Last backup: 2026-04-02T14:33:00Z
Device: iPhone 15 Pro
Messages: 4,231
Photos: 1,089
Apps: WhatsApp, Snapchat, Instagram, Signal`,
    createdAt: new Date('2026-04-02').getTime(),
    modifiedAt: new Date('2026-04-02').getTime(),
    importedAt: new Date('2026-04-03').getTime(),
    isFlagged: false,
    isPinned: false,
    analysisResult: {
      summary: 'Database imported from iCloud, linked to Sarah Johnson, around Apr 2026, referencing iCloud, contains 1 phone number and 1 email address.',
      entities: {
        names: ['Sarah Johnson'],
        phones: ['+1 (555) 234-5678'],
        emails: ['sarah.j@example.com'],
        domains: ['iCloud'],
        urls: [],
        dates: ['2026-04-02'],
        keywords: ['backup', 'messages', 'photos', 'iphone'],
      },
      patterns: [
        'Multi-platform activity: iCloud',
        'Backup file detected',
        'Communication content detected',
      ],
      riskScore: 3.5,
      analyzedAt: new Date('2026-04-03').getTime(),
    },
  },
  {
    sku: 'NS-2026-04-7712',
    name: 'chat_log_whatsapp_2026.txt',
    ext: 'txt',
    size: 89_344,
    mimeType: 'text/plain',
    tags: [
      { dimension: 'who', value: 'Marcus Reed' },
      { dimension: 'what', value: 'Text' },
      { dimension: 'when', value: 'Apr 2026' },
      { dimension: 'where', value: 'WhatsApp' },
    ],
    skuLinks: [],
    bundleIds: [],
    source: 'WhatsApp',
    content: `[2026-04-01 09:15] Marcus Reed: Hey, did you see the news?
[2026-04-01 09:22] Unknown: Yeah just saw it. Crazy stuff.
[2026-04-01 10:05] Marcus Reed: Meet at 5pm same place?
[2026-04-01 10:11] Unknown: Sure. Bring the docs.
Phone: +1 (555) 987-6543
Email: marcus.r@proton.me`,
    createdAt: new Date('2026-04-01').getTime(),
    modifiedAt: new Date('2026-04-10').getTime(),
    importedAt: new Date('2026-04-11').getTime(),
    isFlagged: false,
    isPinned: false,
  },
  {
    sku: 'NS-2026-05-0091',
    name: 'case_notes_may.md',
    ext: 'md',
    size: 4_096,
    mimeType: 'text/markdown',
    tags: [
      { dimension: 'what', value: 'Markdown' },
      { dimension: 'when', value: 'May 2026' },
      { dimension: 'where', value: 'Desktop' },
    ],
    skuLinks: [],
    bundleIds: [],
    source: 'Desktop',
    content: `# Case Notes — May 2026

## Subject: Sarah Johnson

Timeline:
- 2026-03-10: Snapchat export obtained
- 2026-03-15: Instagram profile archived  
- 2026-04-02: iCloud backup recovered
- 2026-04-11: WhatsApp chat log imported

## Key Contacts
- Marcus Reed (+1 555 987-6543)
- Unknown (encrypted)

## Platforms
Snapchat, Instagram, iCloud, WhatsApp`,
    createdAt: new Date('2026-05-01').getTime(),
    modifiedAt: new Date('2026-05-04').getTime(),
    importedAt: new Date('2026-05-04').getTime(),
    isFlagged: false,
    isPinned: true,
  },
  {
    sku: 'NS-2026-02-3390',
    name: 'device_backup_samsung.tar.gz',
    ext: 'gz',
    size: 104_857_600,
    mimeType: 'application/gzip',
    tags: [
      { dimension: 'what', value: 'Archive' },
      { dimension: 'when', value: 'Feb 2026' },
      { dimension: 'where', value: 'Backup' },
    ],
    skuLinks: [],
    bundleIds: [],
    source: 'Backup',
    content: undefined,
    createdAt: new Date('2026-02-14').getTime(),
    modifiedAt: new Date('2026-02-14').getTime(),
    importedAt: new Date('2026-04-20').getTime(),
    isFlagged: false,
    isPinned: false,
  },
];

const DEMO_TIMELINE_EVENTS = [
  { type: 'file_imported' as const, desc: '"icloud_backup_2026-04.db" imported from iCloud', sku: 'NS-2026-04-5531', ago: 1 * 24 * 60 * 60 * 1000 },
  { type: 'file_analyzed' as const, desc: '"icloud_backup_2026-04.db" analyzed — risk 3.5/10', sku: 'NS-2026-04-5531', ago: 23 * 60 * 60 * 1000 },
  { type: 'file_imported' as const, desc: '"chat_log_whatsapp_2026.txt" imported from WhatsApp', sku: 'NS-2026-04-7712', ago: 22 * 60 * 60 * 1000 },
  { type: 'file_tagged' as const, desc: 'Tags updated on "sarah_johnson_profile.jpg"', sku: 'NS-2026-03-1042', ago: 20 * 60 * 60 * 1000 },
  { type: 'sku_linked' as const, desc: 'SKU NS-2026-03-1042 linked to NS-2026-03-2088', sku: undefined, ago: 18 * 60 * 60 * 1000 },
  { type: 'bundle_created' as const, desc: 'Bundle "Sarah Johnson — Case Bundle" created with 4 files', sku: undefined, ago: 15 * 60 * 60 * 1000 },
  { type: 'vault_created' as const, desc: 'Vault "Evidence Vault" created (forensic)', sku: undefined, ago: 12 * 60 * 60 * 1000 },
  { type: 'limbo_opened' as const, desc: 'Limbo session "Snapchat Archive Inspection" opened with 1 file(s)', sku: undefined, ago: 10 * 60 * 60 * 1000 },
  { type: 'file_analyzed' as const, desc: '"snapchat_export_march.zip" analyzed — risk 6.2/10', sku: 'NS-2026-03-2088', ago: 9 * 60 * 60 * 1000 },
  { type: 'limbo_released' as const, desc: 'Limbo session "Snapchat Archive Inspection" released', sku: undefined, ago: 8 * 60 * 60 * 1000 },
  { type: 'file_imported' as const, desc: '"case_notes_may.md" imported from Desktop', sku: 'NS-2026-05-0091', ago: 4 * 60 * 60 * 1000 },
  { type: 'search_performed' as const, desc: 'Search: "Sarah + Snapchat"', sku: undefined, ago: 3 * 60 * 60 * 1000 },
  { type: 'widget_pinned' as const, desc: 'Bundle "Sarah Johnson — Case Bundle" pinned to homescreen', sku: undefined, ago: 2 * 60 * 60 * 1000 },
  { type: 'file_opened' as const, desc: '"icloud_backup_2026-04.db" opened', sku: 'NS-2026-04-5531', ago: 1 * 60 * 60 * 1000 },
  { type: 'search_performed' as const, desc: 'Search: "Marcus + WhatsApp + April"', sku: undefined, ago: 30 * 60 * 1000 },
];

export async function seedDemoData(): Promise<void> {
  // Only seed if DB is empty
  const existing = await db.files.count().catch(() => 0);
  if (existing > 0) return;

  const now = Date.now();

  // Insert demo files
  const fileIds: number[] = [];
  for (const f of DEMO_FILES) {
    const id = await db.files.add(f) as number;
    fileIds.push(id);
  }

  // Create a bundle
  const bundleId = await db.bundles.add({
    name: 'Sarah Johnson — Case Bundle',
    description: 'All files related to Sarah Johnson investigation',
    fileIds: fileIds.slice(0, 4),
    skus: DEMO_FILES.slice(0, 4).map(f => f.sku),
    tags: [
      { dimension: 'who', value: 'Sarah Johnson' },
    ],
    color: '#6c63ff',
    isPinned: true,
    createdAt: now - 15 * 60 * 60 * 1000,
    updatedAt: now - 15 * 60 * 60 * 1000,
  }) as number;

  // Update file bundleIds
  for (const fid of fileIds.slice(0, 4)) {
    const f = await db.files.get(fid);
    if (f) await db.files.update(fid, { bundleIds: [bundleId] });
  }

  // Create a vault
  await db.vaults.add({
    name: 'Evidence Vault',
    type: 'forensic',
    salt: Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join(''),
    iv: Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join(''),
    fileIds: [fileIds[2]],
    createdAt: now - 12 * 60 * 60 * 1000,
    isLocked: true,
    lockedAt: now - 11 * 60 * 60 * 1000,
  }) as number;

  // Create a limbo session (closed)
  await db.limboSessions.add({
    name: 'Snapchat Archive Inspection',
    status: 'clean',
    fileIds: [fileIds[1]],
    analysisLog: [
      `[2026-05-03T18:00:00Z] Limbo session opened: Snapchat Archive Inspection`,
      `[2026-05-03T18:00:01Z] Starting analysis...`,
      `[2026-05-03T18:00:02Z] Analyzing: snapchat_export_march.zip`,
      `[2026-05-03T18:00:03Z] Analysis complete. Status: clean`,
      `  → Found: 1 names, 0 phones, 0 emails`,
      `  → Domains: Snapchat`,
      `[2026-05-03T19:00:00Z] Session released. Files returned to library.`,
    ],
    extractedEntities: {
      names: ['Sarah Johnson'],
      phones: [],
      emails: [],
      domains: ['Snapchat'],
      urls: [],
      dates: ['2026-03'],
      keywords: ['export', 'archive', 'data'],
    },
    openedAt: now - 10 * 60 * 60 * 1000,
    closedAt: now - 8 * 60 * 60 * 1000,
  });

  // Create SKU cluster
  await db.skuClusters.add({
    rootSku: 'NS-2026-03-1042',
    memberSkus: ['NS-2026-03-1042', 'NS-2026-03-2088', 'NS-2026-04-5531'],
    label: 'Sarah Johnson cluster',
    createdAt: now - 18 * 60 * 60 * 1000,
  });

  // Create a pinned homescreen widget
  await db.widgets.add({
    type: 'timeline',
    label: 'Case Timeline',
    config: { filter: 'all' },
    position: { x: 0, y: 0 },
    size: 'md',
    color: '#00d4ff',
    isPinned: true,
    createdAt: now - 2 * 60 * 60 * 1000,
  });

  // Insert timeline events
  for (const evt of DEMO_TIMELINE_EVENTS) {
    await db.timeline.add({
      type: evt.type,
      description: evt.desc,
      fileSku: evt.sku,
      timestamp: now - evt.ago,
    });
  }
}
