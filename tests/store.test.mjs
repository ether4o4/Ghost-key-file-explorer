import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, fs, loadFs, loadStore } from './support.mjs';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
globalThis.window = {
  innerWidth: 1280, innerHeight: 800, showDirectoryPicker() {},
  setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; },
  prompt: () => null, confirm: () => false,
};

async function setup(t) {
  const f = await fixture(t);
  const root = await f.mkdir('source');
  await f.write('source/a.txt', 'A');
  await f.write('source/b.txt', 'B');
  const adapter = (await loadFs()).getAdapter();
  const module = await loadStore(adapter);
  const store = module.useExplorer;
  await store.getState().init();
  const ref = await f.ref(root);
  await store.getState().openLocation(1, 'left', ref);
  await store.getState().openLocation(1, 'right', await f.ref(root));
  return { f, store, module, adapter, ref };
}

test('late listing completion cannot overwrite newer navigation or home', async t => {
  const { f, store, adapter } = await setup(t);
  const slow = await f.ref(await f.mkdir('slow'));
  const fast = await f.ref(await f.mkdir('fast'));
  await f.write('fast/fast.txt', 'FAST');
  let finish;
  const list = adapter.list.bind(adapter);
  adapter.list = ref => ref.name === 'slow' ? new Promise(resolve => { finish = resolve; }) : list(ref);
  const pending = store.getState().openLocation(1, 'left', slow);
  await store.getState().openLocation(1, 'left', fast);
  finish([{ name: 'stale.txt', kind: 'file' }]);
  await pending;
  assert.equal(store.getState().windows[0].panes.left.entries[0].name, 'fast.txt');
  const homePending = store.getState().openLocation(1, 'left', slow);
  store.setState(st => ({ windows: st.windows.map(w => ({ ...w, panes: { ...w.panes, left: { ...w.panes.left, stack: [], entries: [], loading: false } } })) }));
  finish([{ name: 'stale.txt', kind: 'file' }]);
  await homePending;
  assert.deepEqual(store.getState().windows[0].panes.left.entries, []);
});

test('partial deletion reports failure and refreshes both views of the same folder', async t => {
  const { f, store, adapter } = await setup(t);
  const remove = adapter.remove.bind(adapter);
  adapter.remove = (dir, entry) => entry.name === 'b.txt' ? Promise.reject(new Error('provider failure')) : remove(dir, entry);
  window.confirm = () => true;
  store.getState().setSelected(1, 'left', ['a.txt', 'b.txt']);
  await store.getState().deleteSelected(1, 'left');
  assert.deepEqual(await fs.readdir(`${f.root}/source`), ['b.txt']);
  for (const side of ['left', 'right']) assert.deepEqual(store.getState().windows[0].panes[side].entries.map(e => e.name), ['b.txt']);
  assert.equal(store.getState().toast.kind, 'error');
  assert.equal(store.getState().toast.msg, 'provider failure');
});

test('cancel/create/collision and canceled delete preserve actual directory state', async t => {
  const { f, store } = await setup(t);
  window.prompt = () => null;
  await store.getState().newFolder(1, 'left');
  window.prompt = () => 'created';
  await store.getState().newFolder(1, 'left');
  assert.equal(store.getState().toast.kind, 'success');
  assert.equal(store.getState().windows[0].panes.right.entries.length, 3);
  await store.getState().newFolder(1, 'left');
  assert.equal(store.getState().toast.kind, 'error');
  window.confirm = () => false;
  store.getState().setSelected(1, 'left', ['a.txt']);
  await store.getState().deleteSelected(1, 'left');
  assert.deepEqual((await fs.readdir(`${f.root}/source`)).sort(), ['a.txt', 'b.txt', 'created']);
});

test('folder preferences keep existing key/format across store restart', async t => {
  const { store, adapter } = await setup(t);
  store.getState().setFolderPref('existing/path', { color: '#6c63ff', icon: 'archive' });
  const raw = storage.get('gk:folderPrefs');
  const restarted = (await loadStore(adapter)).useExplorer;
  await restarted.getState().init();
  assert.deepEqual(restarted.getState().folderPrefs['existing/path'], { color: '#6c63ff', icon: 'archive' });
  assert.equal(storage.get('gk:folderPrefs'), raw);
  restarted.getState().resetFolderPref('existing/path');
  assert.equal(JSON.parse(storage.get('gk:folderPrefs'))['existing/path'], undefined);
});

test('external folder drop uses the actual target without navigating the pane', async t => {
  const { f, store, adapter } = await setup(t);
  await f.mkdir('source/target');
  await store.getState().refresh(1, 'left');
  const pane = store.getState().windows[0].panes.left;
  const target = pane.entries.find(e => e.name === 'target');
  let destination;
  adapter.importDrop = async (_dt, ref) => { destination = ref; return 1; };
  await store.getState().externalDrop(1, 'left', {}, target);
  assert.equal(destination.handle.path, `${f.root}/source/target`);
  assert.equal(store.getState().windows[0].panes.left.stack.at(-1).name, 'source');
});

test('folder rename carries customization forward without deleting legacy keys', async t => {
  const { f, store } = await setup(t);
  await f.mkdir('source/old/child');
  await store.getState().refresh(1, 'left');
  store.getState().setFolderPref('source/old', { color: '#00d4ff' });
  store.getState().setFolderPref('source/old/child', { icon: 'archive' });
  const entry = store.getState().windows[0].panes.left.entries.find(e => e.name === 'old');
  await store.getState().renameEntry(1, 'left', entry, 'renamed');
  const prefs = JSON.parse(storage.get('gk:folderPrefs'));
  assert.deepEqual(prefs['source/renamed'], prefs['source/old']);
  assert.deepEqual(prefs['source/renamed/child'], prefs['source/old/child']);
  assert.equal(prefs['source/renamed'].color, '#00d4ff');
});

test('storage write failure is surfaced while retaining in-memory preferences', async t => {
  const { store } = await setup(t);
  const setItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota'); };
  try {
    store.getState().setFolderPref('unsaved/path', { color: '#00ff88' });
    assert.equal(store.getState().folderPrefs['unsaved/path'].color, '#00ff88');
    assert.equal(store.getState().toast.kind, 'error');
    assert.match(store.getState().toast.msg, /could not be saved/i);
  } finally { localStorage.setItem = setItem; }
});

test('native permission initialization failure uses the existing error toast', async () => {
  const adapter = { backend: 'native', ensureAccess: async () => false, roots: async () => [] };
  const store = (await loadStore(adapter)).useExplorer;
  await store.getState().init();
  assert.equal(store.getState().toast.kind, 'error');
  assert.match(store.getState().toast.msg, /permission is unavailable/);
});
