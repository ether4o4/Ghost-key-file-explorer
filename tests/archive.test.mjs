/**
 * Ghost Key — Limbo archive engine tests.
 *
 * Runs against the real extract/repackage safety logic using an in-memory
 * FsAdapter stub, so the ZIP-bomb, path-traversal, and verified-round-trip
 * guards are exercised without a device. Run: node --test tests/archive.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { strToU8, zipSync } = await import(pathToFileURL(require.resolve('fflate')).href);

// Import the compiled production source, not a parallel test implementation.
import { extractToLimbo, repackage, hashBytes, safe } from './_archive-bridge.mjs';

// ── In-memory adapter stub ────────────────────────────────────────────────
function makeMemAdapter() {
  const store = new Map(); // uri -> Uint8Array (files) ; dirs tracked in set
  const dirs = new Set(['mem://ws']);
  return {
    backend: 'native',
    _store: store,
    _staged: 0,
    async readBytes(entry) {
      if (entry.__bytes) return entry.__bytes;
      return store.get(entry.uri);
    },
    async stagingDir(sub) {
      this._staged++;
      const uri = `mem://ws/${sub}`;
      dirs.add(uri);
      return { backend: 'native', name: sub, uri };
    },
    async ensureDir(dir, rel) {
      const uri = rel ? `${dir.uri}/${rel}` : dir.uri;
      dirs.add(uri);
      return { backend: 'native', name: rel || dir.name, uri };
    },
    async writeBytes(dir, rel, bytes) {
      store.set(`${dir.uri}/${rel}`, bytes);
    },
    async removeDir() {},
    async list(dir) {
      const base = dir.uri + '/';
      const out = new Map();
      for (const key of store.keys()) {
        if (!key.startsWith(base)) continue;
        const rest = key.slice(base.length);
        const slash = rest.indexOf('/');
        if (slash === -1) {
          out.set(rest, { name: rest, kind: 'file', uri: key, ext: rest.split('.').pop() || '', size: store.get(key).length, mtime: 0 });
        } else {
          const name = rest.slice(0, slash);
          out.set(name, { name, kind: 'directory', uri: base + name, ext: '', size: 0, mtime: 0 });
        }
      }
      return [...out.values()];
    },
  };
}

test('extracts a normal zip into isolated staging', async () => {
  const zip = zipSync({
    'readme.txt': strToU8('hello'),
    'sub/data.json': strToU8('{"a":1}'),
  });
  const adapter = makeMemAdapter();
  const res = await extractToLimbo(adapter, { kind: 'file', ext: 'zip', name: 'ok.zip', __bytes: zip });
  assert.equal(res.fileCount, 2);
  assert.ok(res.workspace.uri.startsWith('mem://ws/'));
});

test('rejects path traversal entries', async () => {
  const zip = zipSync({ '../escape.txt': strToU8('bad') });
  const adapter = makeMemAdapter();
  await assert.rejects(
    () => extractToLimbo(adapter, { kind: 'file', ext: 'zip', name: 'eviL.zip', __bytes: zip }),
    /unsafe path/i,
  );
});

function headers(zip) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const central = view.getUint32(zip.length - 6, true);
  const local = view.getUint32(central + 42, true);
  const payload = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  return { view, central, local, payload };
}

test('rejects excessive declared output before inflation or staging', async () => {
  const zip = zipSync({ 'bomb.bin': strToU8('tiny') });
  const { view, central, local, payload } = headers(zip);
  view.setUint32(central + 24, 512 * 1024 * 1024, true);
  view.setUint32(local + 22, 512 * 1024 * 1024, true);
  zip[payload] = 7; // Invalid deflate: inflation would fail before any size check.
  const adapter = makeMemAdapter();
  await assert.rejects(
    () => extractToLimbo(adapter, { kind: 'file', ext: 'zip', name: 'bomb.zip', __bytes: zip }),
    /uncompressed size exceeds limit/i,
  );
  assert.equal(adapter._staged, 0);
});

test('rejects declared compression ratio before inflation', async () => {
  const zip = zipSync({ 'bomb.bin': strToU8('tiny') });
  const { view, central, local, payload } = headers(zip);
  view.setUint32(central + 24, 60 * 1024 * 1024, true);
  view.setUint32(local + 22, 60 * 1024 * 1024, true);
  zip[payload] = 7;
  const adapter = makeMemAdapter();
  await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }), /zip bomb|ratio/i);
  assert.equal(adapter._staged, 0);
});

test('rejects aliases that would overwrite a staged file', async () => {
  for (const alias of ['./a.txt', './/a.txt']) {
    const adapter = makeMemAdapter();
    const zip = zipSync({ 'a.txt': strToU8('first'), [alias]: strToU8('second') });
    await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }), /colliding path/i);
    assert.equal(adapter._staged, 0);
  }
});

test('rejects file/directory conflicts in either order', async () => {
  for (const names of [['folder', 'folder/file'], ['folder/file', 'folder']]) {
    const adapter = makeMemAdapter();
    const zip = zipSync(Object.fromEntries(names.map(n => [n, strToU8('data')])));
    await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }), /file\/directory collision/i);
    assert.equal(adapter._staged, 0);
  }
});

test('rejects altered bytes even when stored file lengths still match', async () => {
  const zip = zipSync({ 'a.txt': strToU8('hello') }, { level: 0 });
  const { payload } = headers(zip);
  zip[payload] ^= 1;
  const adapter = makeMemAdapter();
  await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }), /checksum mismatch/i);
  assert.equal(adapter._staged, 0);
});

test('rejects under-declared deflate data instead of accepting a truncated prefix', async () => {
  const zip = zipSync({ 'a.txt': strToU8('hello world') });
  const prefix = zipSync({ 'a.txt': strToU8('hello') });
  const { view, central, local } = headers(zip);
  const p = headers(prefix);
  const forgedPrefixCrc = p.view.getUint32(p.central + 16, true);
  view.setUint32(central + 24, 5, true);
  view.setUint32(local + 22, 5, true);
  view.setUint32(central + 16, forgedPrefixCrc, true);
  view.setUint32(local + 14, forgedPrefixCrc, true);
  const adapter = makeMemAdapter();
  await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }), /size\/checksum mismatch/i);
  assert.equal(adapter._staged, 0);
});

test('rejects duplicate central-directory names before extraction', async () => {
  const zip = zipSync({ 'a.txt': strToU8('first'), 'b.txt': strToU8('second') });
  const { view, central } = headers(zip);
  const next = central + 46 + view.getUint16(central + 28, true) + view.getUint16(central + 30, true) + view.getUint16(central + 32, true);
  const secondLocal = view.getUint32(next + 42, true);
  zip[next + 46] = 'a'.charCodeAt(0);
  zip[secondLocal + 30] = 'a'.charCodeAt(0);
  const adapter = makeMemAdapter();
  await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }), /colliding path/i);
  assert.equal(adapter._staged, 0);
});

test('rejects excess entry count and unsupported ZIP64 before staging', async () => {
  const adapter = makeMemAdapter();
  const zip = zipSync({ 'a.txt': strToU8('a'), 'b.txt': strToU8('b') });
  await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }, { maxEntries: 1, maxTotalBytes: 1024, maxRatio: 200 }), /entry count/i);
  const { view, central } = headers(zip);
  view.setUint32(central + 24, 0xffffffff, true);
  await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }), /ZIP64/i);
  assert.equal(adapter._staged, 0);
});

test('rejects malformed directory offsets and unsafe path variants', async () => {
  const adapter = makeMemAdapter();
  const zip = zipSync({ 'a.txt': strToU8('a') });
  const { view } = headers(zip);
  view.setUint32(zip.length - 6, zip.length + 10, true);
  await assert.rejects(() => extractToLimbo(adapter, { __bytes: zip }), /bounds/i);
  for (const path of ['/absolute', '\\absolute', 'C:relative', 'C:\\absolute', 'a\0b', '../up']) {
    assert.throws(() => safe(path), /unsafe path/i);
  }
  assert.deepEqual(safe(''), []);
});

test('preserves explicit empty directories and Unicode paths', async () => {
  const files = { 'empty/': new Uint8Array(), 'café/notes.txt': strToU8('hello') };
  const packed = repackage(files);
  const adapter = makeMemAdapter();
  const extracted = await extractToLimbo(adapter, { __bytes: packed.bytes });
  assert.deepEqual(extracted.entries.map(e => e.path), ['empty/', 'café/notes.txt']);
  assert.equal(extracted.fileCount, 1);
  assert.equal(extracted.totalBytes, 5);
});

test('cleans up a partially written staging workspace on failure', async () => {
  const adapter = makeMemAdapter();
  let removed = false;
  adapter.writeBytes = async () => { throw new Error('disk full'); };
  adapter.removeDir = async () => { removed = true; };
  await assert.rejects(() => extractToLimbo(adapter, { __bytes: zipSync({ 'a': strToU8('a') }) }), /disk full/);
  assert.equal(removed, true);
});

test('repackage verifies round-trip and emits checksum', () => {
  const files = { 'a.txt': strToU8('alpha'), 'dir/b.txt': strToU8('beta') };
  const res = repackage(files);
  assert.equal(res.verified, true);
  assert.equal(res.entryCount, 2);
  assert.match(res.checksum, /^[0-9a-f]{16}$/);
});

test('hashBytes is stable and order-sensitive', () => {
  assert.equal(hashBytes(strToU8('abc')), hashBytes(strToU8('abc')));
  assert.notEqual(hashBytes(strToU8('abc')), hashBytes(strToU8('acb')));
});
