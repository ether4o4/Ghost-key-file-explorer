import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/core/windowLayout.ts', import.meta.url), 'utf8');
const emitted = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText;
const { sanitizeWindowPrefs, fitWindowBounds } = await import(`data:text/javascript;base64,${Buffer.from(emitted).toString('base64')}`);

test('invalid persisted window preferences cannot become invalid geometry', () => {
  for (const value of [null, [], 'bounds', 1, false]) assert.deepEqual(sanitizeWindowPrefs(value), {});
  assert.deepEqual(sanitizeWindowPrefs({
    x: '900', y: Infinity, w: -10, h: NaN, maximized: 'false', extra: true,
  }), {});
  assert.deepEqual(sanitizeWindowPrefs({ x: -10, y: 20, w: 800, h: 500, maximized: false }),
    { x: -10, y: 20, w: 800, h: 500, maximized: false });
});

test('desktop bounds restored on a phone leave the complete window reachable', () => {
  const bounds = fitWindowBounds({ x: 900, y: 500, w: 1000, h: 700 }, 390, 796);
  assert.ok(bounds.x >= 0 && bounds.y >= 0);
  assert.ok(bounds.x + bounds.w <= 390);
  assert.ok(bounds.y + bounds.h <= 796);
  assert.ok(bounds.w > 300 && bounds.h >= 280);
});

test('rotation and keyboard-sized work areas fit without negative dimensions', () => {
  const wide = { x: 600, y: 300, w: 800, h: 600 };
  for (const [width, height] of [[844, 342], [390, 160], [100, 80]]) {
    const bounds = fitWindowBounds(wide, width, height);
    assert.ok(bounds.w > 0 && bounds.h > 0);
    assert.ok(bounds.x >= 0 && bounds.y >= 0);
    assert.ok(bounds.x + bounds.w <= width);
    assert.ok(bounds.y + bounds.h <= height);
  }
});

test('valid desktop bounds remain unchanged', () => {
  const bounds = { x: 100, y: 80, w: 900, h: 600 };
  assert.deepEqual(fitWindowBounds(bounds, 1280, 752), bounds);
});
