import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, fs, hash, File, loadFs } from './support.mjs';

globalThis.File = File;
globalThis.window = { showDirectoryPicker() {} };
const error = name => new DOMException(name, name);

async function setup(t) {
  const f = await fixture(t);
  const src = await f.mkdir('source');
  const dst = await f.mkdir('destination');
  await f.write('source/evidence.bin', Buffer.from([0, 255, 1, 128, 10, 0]));
  const adapter = (await loadFs()).getAdapter();
  const source = await f.ref(src), destination = await f.ref(dst);
  const entry = (await adapter.list(source))[0];
  return { f, adapter, source, destination, entry };
}

test('copy, collision, rename, move, delete and restart preserve exact bytes', async t => {
  const { f, adapter, source, destination, entry } = await setup(t);
  const original = hash(await fs.readFile(`${f.root}/source/evidence.bin`));
  await adapter.transfer(source, entry, destination, 'copy');
  await adapter.transfer(source, entry, destination, 'copy');
  assert.equal(hash(await fs.readFile(`${f.root}/destination/evidence (copy).bin`)), original);
  assert.equal(hash(await fs.readFile(`${f.root}/source/evidence.bin`)), original);
  await adapter.rename(source, entry, 'renamed.bin');
  const restarted = (await loadFs()).getAdapter();
  const renamed = (await restarted.list(await f.ref(`${f.root}/source`)))[0];
  await restarted.transfer(source, renamed, destination, 'move');
  assert.deepEqual(await fs.readdir(`${f.root}/source`), []);
  assert.equal(hash(await fs.readFile(`${f.root}/destination/renamed.bin`)), original);
  await restarted.remove(destination, (await restarted.list(destination)).find(e => e.name === 'renamed.bin'));
  assert.deepEqual((await fs.readdir(`${f.root}/destination`)).sort(), ['evidence (copy).bin', 'evidence.bin']);
});

test('rename and touch reject collisions without modifying either file', async t => {
  const { f, adapter, source, entry } = await setup(t);
  await f.write('source/occupied.bin', 'KEEP');
  await assert.rejects(adapter.rename(source, entry, 'occupied.bin'), /exists/);
  await assert.rejects(adapter.touch(source, 'evidence.bin'), /exists/);
  assert.equal(await fs.readFile(`${f.root}/source/occupied.bin`, 'utf8'), 'KEEP');
  assert.equal((await fs.readFile(`${f.root}/source/evidence.bin`)).length, 6);
});

test('folder self/descendant transfers fail before writing or deleting', async t => {
  const { f, adapter, source } = await setup(t);
  await f.mkdir('source/folder/child/grandchild');
  await f.write('source/folder/child/grandchild/keep.txt', 'KEEP');
  const folder = (await adapter.list(source)).find(e => e.name === 'folder');
  for (const mode of ['copy', 'move']) {
    for (const target of ['folder', 'folder/child', 'folder/child/grandchild']) {
      await assert.rejects(adapter.transfer(source, folder, await f.ref(`${f.root}/source/${target}`), mode), /itself|descendant/);
    }
  }
  assert.deepEqual(await fs.readdir(`${f.root}/source/folder`), ['child']);
  assert.equal(await fs.readFile(`${f.root}/source/folder/child/grandchild/keep.txt`, 'utf8'), 'KEEP');
});

test('complete directory moves retain every descendant byte', async t => {
  const { f, adapter, source, destination } = await setup(t);
  await f.mkdir('source/tree/nested');
  await f.write('source/tree/nested/content.bin', Buffer.from([1, 0, 255, 2]));
  const tree = (await adapter.list(source)).find(e => e.name === 'tree');
  await adapter.transfer(source, tree, destination, 'move');
  assert.equal(hash(await fs.readFile(`${f.root}/destination/tree/nested/content.bin`)), hash(Buffer.from([1, 0, 255, 2])));
  await assert.rejects(fs.stat(`${f.root}/source/tree`), { code: 'ENOENT' });
});

test('same-directory move is a no-op across separately acquired handles', async t => {
  const { f, adapter, source, entry } = await setup(t);
  await adapter.transfer(source, entry, await f.ref(`${f.root}/source`), 'move');
  assert.deepEqual(await fs.readdir(`${f.root}/source`), ['evidence.bin']);
});

test('permission denied/regranted and existence-provider failure are honest', async t => {
  const { f, adapter, source, destination, entry } = await setup(t);
  f.faults.set(`permission:${source.handle.path}`, true);
  await assert.rejects(adapter.list(source), /permission denied/);
  f.faults.delete(`permission:${source.handle.path}`);
  assert.equal((await adapter.list(source)).length, 1);
  f.faults.set(`probe:${destination.handle.path}`, error('NotAllowedError'));
  await assert.rejects(adapter.transfer(source, entry, destination, 'move'), { name: 'NotAllowedError' });
  assert.deepEqual(await fs.readdir(destination.handle.path), []);
  assert.equal((await fs.readFile(`${f.root}/source/evidence.bin`)).length, 6);
});

test('failed writes/close/delete never erase source or hide the failure', async t => {
  for (const action of ['stream', 'close']) {
    const { f, adapter, source, destination, entry } = await setup(t);
    f.faults.set(`${action}:${destination.handle.path}/evidence.bin`, error('UnknownError'));
    await assert.rejects(adapter.transfer(source, entry, destination, 'move'), { name: 'UnknownError' });
    assert.equal((await fs.readFile(`${f.root}/source/evidence.bin`)).length, 6);
    assert.equal((await fs.readFile(`${f.root}/destination/evidence.bin`)).length, 0);
  }
  const { f, adapter, source, destination, entry } = await setup(t);
  f.faults.set(`remove:${source.handle.path}`, error('NotAllowedError'));
  await assert.rejects(adapter.transfer(source, entry, destination, 'move'), { name: 'NotAllowedError' });
  assert.equal(hash(await fs.readFile(`${f.root}/source/evidence.bin`)), hash(await fs.readFile(`${f.root}/destination/evidence.bin`)));
});

test('a replaced source handle cannot delete or rename the replacement', async t => {
  const { f, adapter, source, entry } = await setup(t);
  await fs.rename(`${f.root}/source/evidence.bin`, `${f.root}/source/original.bin`);
  await f.write('source/evidence.bin', 'NEW');
  await assert.rejects(adapter.remove(source, entry), /source changed/i);
  await assert.rejects(adapter.rename(source, entry, 'other.bin'), /source changed/i);
  assert.equal(await fs.readFile(`${f.root}/source/evidence.bin`, 'utf8'), 'NEW');
});

test('invalid names and canceled picker cause no mutation', async t => {
  const { f, adapter, source, entry } = await setup(t);
  for (const name of ['', '.', '..', '../escape', 'a/b', 'a\\b', 'a\0b']) {
    await assert.rejects(adapter.mkdir(source, name));
    await assert.rejects(adapter.rename(source, entry, name));
  }
  window.showDirectoryPicker = async () => { throw error('AbortError'); };
  assert.equal(await adapter.pickRoot(), null);
  assert.deepEqual(await fs.readdir(`${f.root}/source`), ['evidence.bin']);
});

test('imports preserve binary bytes, collisions and mixed drop items; errors propagate', async t => {
  const { f, adapter, destination, entry } = await setup(t);
  const file = new File([Buffer.from([0, 128, 255])], 'import.bin');
  await adapter.importFiles([file, file], destination);
  assert.equal(hash(await fs.readFile(`${f.root}/destination/import (copy).bin`)), hash(Buffer.from([0, 128, 255])));
  assert.equal(await adapter.importDrop({ items: [
    { kind: 'file', getAsFileSystemHandle: async () => entry.handle },
    { kind: 'file', getAsFile: () => new File(['TEXT'], 'plain.txt') },
  ], files: [] }, destination), 2);
  assert.equal(await fs.readFile(`${f.root}/destination/plain.txt`, 'utf8'), 'TEXT');
  f.faults.set(`read:${entry.handle.path}`, error('NotReadableError'));
  await assert.rejects(adapter.importDrop({ items: [{ kind: 'file', getAsFileSystemHandle: async () => entry.handle }], files: [] }, destination), { name: 'NotReadableError' });
});

test('native contract: denial, collision, identity, ancestry and provider errors', async () => {
  const calls = [];
  const plugin = {
    checkPermissions: async () => { throw new Error('permission service unavailable'); },
    readdir: async ({ path }) => {
      if (path === 'file:///denied') throw new Error('provider denied');
      return { files: [{ name: 'keep.bin', type: 'file' }, { name: 'tree', type: 'directory' }, { name: 'taken.bin', type: 'file' }] };
    },
    rename: async args => { calls.push(args); },
    copy: async args => { calls.push(args); },
  };
  const adapter = (await loadFs(true, plugin)).getAdapter();
  const source = { backend: 'native', uri: 'file:///source', name: 'source' };
  const entry = { name: 'keep.bin', kind: 'file', uri: 'file:///source/keep.bin', nativeId: 'keep.bin' };
  assert.equal(await adapter.ensureAccess(), false);
  await assert.rejects(adapter.rename(source, entry, 'taken.bin'), /exists/);
  await adapter.transfer(source, entry, { ...source, uri: 'file:///source/' }, 'move');
  await assert.rejects(adapter.remove(source, { ...entry, uri: 'file:///other/keep.bin' }), /source/);
  for (const mode of ['move', 'copy']) {
    await assert.rejects(adapter.transfer(source, { name: 'tree', kind: 'directory', uri: 'file:///source/tree', nativeId: 'tree' }, { ...source, uri: 'file:///source/tree/a/../child' }, mode), /descendant/);
  }
  await assert.rejects(adapter.transfer(source, entry, { ...source, uri: 'file:///denied' }, 'copy'), /provider denied/);
  await assert.rejects(adapter.transfer(source, entry, { ...source, uri: 'content://tree/opaque' }, 'copy'), /provider/);
  assert.deepEqual(calls, []);
});

test('concurrent pane imports serialize collision names without losing bytes', async t => {
  const { f, adapter, destination } = await setup(t);
  await Promise.all([
    adapter.importFiles([new File(['FIRST'], 'same.bin')], destination),
    adapter.importFiles([new File(['SECOND'], 'same.bin')], destination),
  ]);
  assert.equal(await fs.readFile(`${f.root}/destination/same.bin`, 'utf8'), 'FIRST');
  assert.equal(await fs.readFile(`${f.root}/destination/same (copy).bin`, 'utf8'), 'SECOND');
});

test('native postconditions reject fake delete/copy success and stale inode identity', async () => {
  const source = { backend: 'native', uri: 'file:///source', name: 'source' };
  const entry = { name: 'tree', kind: 'directory', uri: 'file:///source/tree', nativeId: 'tree' };
  const plugin = {
    readdir: async () => ({ files: [{ name: 'tree', type: 'directory' }] }),
    rmdir: async () => {},
    copy: async () => {},
  };
  const adapter = (await loadFs(true, plugin, {
    verifyCopy: async () => { throw new Error('Copy verification failed: file bytes differ'); },
  })).getAdapter();
  await assert.rejects(adapter.remove(source, entry), /Delete verification failed/);
  await assert.rejects(adapter.transfer(source, entry, { ...source, uri: 'file:///destination' }, 'copy'), /file bytes differ/);
  await assert.rejects(adapter.remove(source, { ...entry, nativeId: 'replaced-inode' }), /source changed/i);
});

test('native canonical ancestry and unreadable-list failure are checked before writes', async () => {
  let writes = 0;
  const source = { backend: 'native', uri: 'file:///alias', name: 'source' };
  const entry = { name: 'tree', kind: 'directory', uri: 'file:///canonical/tree', nativeId: 'tree' };
  const adapter = (await loadFs(true, { copy: async () => { writes++; } }, {
    inspectDirectory: async ({ path }) => {
      if (path === 'file:///denied') throw new Error('Provider could not read folder');
      return {
        canonicalUri: path === 'file:///alias' ? 'file:///canonical' : 'file:///canonical/tree/child',
        files: [{ name: 'tree', type: 'directory', nativeId: 'tree', uri: 'file:///canonical/tree' }],
      };
    },
  })).getAdapter();
  await assert.rejects(adapter.transfer(source, entry, { ...source, uri: 'file:///other-alias' }, 'copy'), /descendant/);
  await assert.rejects(adapter.list({ ...source, uri: 'file:///denied' }), /could not read/);
  assert.equal(writes, 0);
});

test('native archive placement rejects collisions and inaccessible parents before writes', async () => {
  const writes = [];
  const plugin = {
    readdir: async ({ path }) => {
      if (path === 'file:///denied') throw new Error('provider denied');
      return { files: [{ name: 'source.zip', type: 'file' }] };
    },
    writeFile: async options => { writes.push(options); },
  };
  const adapter = (await loadFs(true, plugin)).getAdapter();
  const dir = { backend: 'native', uri: 'file:///library', name: 'library' };
  await assert.rejects(adapter.writeBytes(dir, 'source.zip', new Uint8Array([1])), /already exists/);
  await assert.rejects(adapter.writeBytes({ ...dir, uri: 'file:///denied' }, 'new.zip', new Uint8Array([1])), /provider denied/);
  assert.deepEqual(writes, []);
});

test('drop captures every handle request before waiting for any one handle', async t => {
  const { f, adapter, destination } = await setup(t);
  await f.write('source/second.txt', 'SECOND');
  const first = await f.handle(`${f.root}/source/evidence.bin`);
  const second = await f.handle(`${f.root}/source/second.txt`);
  let active = true, complete;
  const gate = new Promise(resolve => { complete = resolve; });
  let handleCalls = 0;
  const dt = { files: [], items: [first, second].map((handle, index) => ({
    kind: 'file', getAsFile: () => null,
    getAsFileSystemHandle: () => {
      assert.equal(active, true, 'handle requested after drop event expired');
      handleCalls++;
      return index === 0 ? gate.then(() => handle) : Promise.resolve(handle);
    },
  })) };
  const importing = adapter.importDrop(dt, destination);
  active = false;
  assert.equal(handleCalls, 2);
  complete();
  assert.equal(await importing, 2);
  assert.equal(await fs.readFile(`${f.root}/destination/second.txt`, 'utf8'), 'SECOND');
});
