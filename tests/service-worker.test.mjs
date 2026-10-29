import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function worker(fetchImpl) {
  const events = {};
  const deleted = [];
  const stored = [];
  const cached = new Response('OLD', { status: 200 });
  const cache = { addAll: async () => {}, put: async (request, response) => stored.push(await response.text()) };
  const caches = {
    open: async () => cache, match: async () => cached.clone(),
    keys: async () => ['ghost-key-v1', 'ghost-key-old', 'other-app-user-cache'],
    delete: async name => deleted.push(name),
  };
  runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => { events[name] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches, fetch: fetchImpl, URL, console,
  });
  return { events, deleted, stored };
}

test('online navigation refreshes old HTML without clearing stored app state; offline falls back', async () => {
  const online = await worker(async () => new Response('NEW'));
  let response;
  online.events.fetch({ request: { url: 'https://example.test/', method: 'GET', mode: 'navigate', destination: 'document' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'NEW');
  assert.deepEqual(online.stored, ['NEW']);
  const offline = await worker(async () => { throw new Error('offline'); });
  offline.events.fetch({ request: { url: 'https://example.test/index.html', method: 'GET', mode: 'navigate', destination: 'document' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'OLD');
});

test('activation does not delete unrelated user/app caches', async () => {
  const w = await worker(async () => new Response('OK'));
  let done;
  w.events.activate({ waitUntil: promise => { done = promise; } });
  await done;
  assert.deepEqual(w.deleted, ['ghost-key-old']);
});

test('native file URLs and lookalike origins bypass app asset caches', async () => {
  const w = await worker(async () => new Response('OK'));
  for (const url of ['https://example.test/_capacitor_file_/private/file.bin', 'https://example.test.evil/script.js']) {
    let intercepted = false;
    w.events.fetch({ request: { url, method: 'GET', destination: 'script' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
