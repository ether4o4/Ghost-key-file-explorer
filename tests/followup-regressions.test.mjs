// Independent review cases. Run from the Ghost Key repository root:
// node --test /path/to/followup-regressions.test.mjs
// Uses the handoff's existing test harness; drop lifetime is simulated, not OS-drag proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { fixture, loadFs, loadStore, File } = await import(pathToFileURL(path.resolve(process.env.GK_REPO_DIR || process.cwd(), 'tests/support.mjs')).href);

function globals() {
  globalThis.window = { showDirectoryPicker() {}, innerWidth: 1280, innerHeight: 800, setTimeout: () => 0 };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
}

test('external drop is captured while its event is active even when another mutation is pending', async t => {
  globals();
  const f = await fixture(t);
  const destination = await f.ref(await f.mkdir('destination'));
  const adapter = (await loadFs()).getAdapter();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const getFileHandle = destination.handle.getFileHandle.bind(destination.handle);
  destination.handle.getFileHandle = async (name, opts) => {
    if (name === 'busy.txt' && opts?.create) { entered(); await gate; }
    return getFileHandle(name, opts);
  };
  const busy = adapter.importFiles([new File(['busy'], 'busy.txt')], destination);
  await started;
  let dropEventActive = true;
  const file = new File(['must import'], 'dropped.txt');
  const dt = {
    get items() { return dropEventActive ? [{ kind: 'file', getAsFile: () => file }] : []; },
    get files() { return dropEventActive ? [file] : []; },
  };
  const dropping = adapter.importDrop(dt, destination);
  dropEventActive = false;
  release();
  await busy;
  const imported = await dropping;
  assert.equal(imported, 1, 'queued imports must retain the dropped file after event expiration');
  assert.deepEqual((await adapter.list(destination)).map(e => e.name).sort(), ['busy.txt', 'dropped.txt']);
});

test('older same-directory refresh cannot overwrite a newer completed refresh', async t => {
  globals();
  const f = await fixture(t);
  const destination = await f.ref(await f.mkdir('destination'));
  const adapter = (await loadFs()).getAdapter();
  const store = (await loadStore(adapter)).useExplorer;
  await store.getState().init();
  await store.getState().openLocation(1, 'left', destination);
  const pending = [];
  adapter.list = () => new Promise(resolve => pending.push(resolve));
  const older = store.getState().refresh(1, 'left');
  const newer = store.getState().refresh(1, 'left');
  pending[1]([{ name: 'new-state.txt', kind: 'file' }]);
  await newer;
  pending[0]([{ name: 'stale-state.txt', kind: 'file' }]);
  await older;
  assert.deepEqual(store.getState().windows[0].panes.left.entries.map(e => e.name), ['new-state.txt']);
});
