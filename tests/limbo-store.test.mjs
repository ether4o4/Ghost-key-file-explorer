import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { fixture, fs, hash, loadFs, loadStore } from './support.mjs';

globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.window = { showDirectoryPicker() {}, innerWidth: 1280, innerHeight: 800, setTimeout: () => 0, prompt: () => null };

async function setup(t) {
  const f = await fixture(t);
  const opfs = await f.handle(await f.mkdir('opfs'));
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { getDirectory: async () => opfs } } });
  const library = await f.ref(await f.mkdir('library'));
  const bytes = zipSync({ 'file.txt': strToU8('ORIGINAL'), 'empty/': new Uint8Array() });
  await f.write('library/source.zip', bytes);
  const adapter = (await loadFs()).getAdapter();
  const store = (await loadStore(adapter)).useExplorer;
  await store.getState().init();
  await store.getState().openLocation(1, 'left', library);
  const entry = (await adapter.list(library))[0];
  await store.getState().limboOpen(1, 'left', entry);
  assert.ok(store.getState().limbo, store.getState().toast?.msg);
  return { f, library, bytes, adapter, store, entry };
}

test('Limbo placement refuses the source/archive collision without changing bytes or workspace', async t => {
  const { f, store, bytes } = await setup(t);
  const workspace = store.getState().limbo;
  window.prompt = () => 'source.zip';
  await store.getState().limboRepackagePlace(1, 'left');
  assert.equal(store.getState().toast.kind, 'error');
  assert.match(store.getState().toast.msg, /already exists/);
  assert.equal(hash(await fs.readFile(`${f.root}/library/source.zip`)), hash(bytes));
  assert.equal(store.getState().limbo.id, workspace.id);
  assert.equal(await fs.readFile(`${workspace.workspace.handle.path}/file.txt`, 'utf8'), 'ORIGINAL');
});

test('Limbo successful placement retains file bytes and empty directories', async t => {
  const { f, store } = await setup(t);
  window.prompt = () => 'repacked.zip';
  await store.getState().limboRepackagePlace(1, 'left');
  assert.equal(store.getState().toast.kind, 'success', store.getState().toast.msg);
  const result = unzipSync(await fs.readFile(`${f.root}/library/repacked.zip`));
  assert.deepEqual(Object.keys(result).sort(), ['empty/', 'file.txt']);
  assert.equal(new TextDecoder().decode(result['file.txt']), 'ORIGINAL');
});

test('failed replacement extraction leaves the previous Limbo workspace intact', async t => {
  const { f, store, library, adapter } = await setup(t);
  const previous = store.getState().limbo;
  await f.write('library/broken.zip', 'not a ZIP');
  const broken = (await adapter.list(library)).find(e => e.name === 'broken.zip');
  await store.getState().limboOpen(1, 'left', broken);
  assert.equal(store.getState().toast.kind, 'error');
  assert.equal(store.getState().limbo.id, previous.id);
  assert.equal(await fs.readFile(`${previous.workspace.handle.path}/file.txt`, 'utf8'), 'ORIGINAL');
});

test('evicted staging contents cannot silently produce an incomplete archive', async t => {
  const { f, store } = await setup(t);
  const previous = store.getState().limbo;
  await fs.unlink(`${previous.workspace.handle.path}/file.txt`);
  window.prompt = () => 'incomplete.zip';
  await store.getState().limboRepackagePlace(1, 'left');
  assert.equal(store.getState().toast.kind, 'error');
  assert.match(store.getState().toast.msg, /contents are missing/);
  assert.equal(store.getState().limbo.id, previous.id);
  await assert.rejects(fs.stat(`${f.root}/library/incomplete.zip`), { code: 'ENOENT' });
});

test('a discard cannot remove a workspace while placement is reading it', async t => {
  const { store, adapter } = await setup(t);
  const previous = store.getState().limbo;
  const read = adapter.readBytes.bind(adapter);
  let started, finish;
  const entered = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { finish = resolve; });
  adapter.readBytes = async entry => { started(); await gate; return read(entry); };
  window.prompt = () => 'safe.zip';
  const placing = store.getState().limboRepackagePlace(1, 'left');
  await entered;
  await store.getState().limboDiscard();
  assert.equal(store.getState().limbo.id, previous.id);
  finish();
  await placing;
  assert.equal(store.getState().toast.kind, 'success', store.getState().toast.msg);
});

test('cleanup failure retains the selected workspace and reports failure', async t => {
  const { store, adapter } = await setup(t);
  const previous = store.getState().limbo;
  adapter.removeDir = async () => { throw new Error('cache access denied'); };
  await store.getState().limboDiscard();
  assert.equal(store.getState().toast.kind, 'error');
  assert.equal(store.getState().limbo.id, previous.id);
});

test('Place here targets the selected folder and refreshes other panes viewing it', async t => {
  const { f, store, adapter, library, bytes } = await setup(t);
  await f.mkdir('library/destination');
  const destination = (await adapter.list(library)).find(entry => entry.name === 'destination');
  await store.getState().openLocation(1, 'right', adapter.enter(destination));
  window.prompt = () => 'source.zip';
  await store.getState().limboRepackagePlace(1, 'left', destination);
  assert.equal(store.getState().toast.kind, 'success', store.getState().toast.msg);
  assert.equal(hash(await fs.readFile(`${f.root}/library/source.zip`)), hash(bytes));
  assert.equal(new TextDecoder().decode(unzipSync(await fs.readFile(`${f.root}/library/destination/source.zip`))['file.txt']), 'ORIGINAL');
  assert.equal(store.getState().windows[0].panes.right.entries[0].name, 'source.zip');
  assert.equal(store.getState().windows[0].panes.left.stack.at(-1), library);
});
