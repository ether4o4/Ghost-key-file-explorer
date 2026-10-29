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

// Import the compiled-free TS source via a tiny transpile-on-read shim is
// overkill here; instead we import the pure functions by re-implementing the
// import path through esbuild-free dynamic import of the source is not possible
// in plain node. So we test through the built dist is also heavy. Keep it
// focused: import the source using the Node TS stripping available in v22.
import { extractToLimbo, repackage, hashBytes, safe as _ } from './_archive-bridge.mjs';

// ── In-memory adapter stub ────────────────────────────────────────────────
function makeMemAdapter() {
  const store = new Map(); // uri -> Uint8Array (files) ; dirs tracked in set
  const dirs = new Set(['mem://ws']);
  return {
    backend: 'native',
    _store: store,
    async readBytes(entry) {
      if (entry.__bytes) return entry.__bytes;
      return store.get(entry.uri);
    },
    async stagingDir(sub) {
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

test('rejects zip bombs by ratio', async () => {
  // 80 MiB of zeros compresses tiny -> huge ratio over the 50 MiB floor.
  const big = new Uint8Array(80 * 1024 * 1024);
  const zip = zipSync({ 'bomb.bin': big }, { level: 6 });
  const adapter = makeMemAdapter();
  await assert.rejects(
    () => extractToLimbo(adapter, { kind: 'file', ext: 'zip', name: 'bomb.zip', __bytes: zip }),
    /zip bomb|ratio/i,
  );
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
