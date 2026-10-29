// Adapter-contract fixture backed by real disposable Linux files.
// This is NOT evidence of browser FSA or Android provider execution.
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { create } from 'zustand';

export { fs, File };
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const failure = name => new DOMException(name, name);

export async function fixture(t) {
  const root = await fs.mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'gk-regression-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const faults = new Map();
  async function makeHandle(filePath) {
    const stat = await fs.stat(filePath);
    return new Handle(filePath, stat.isDirectory() ? 'directory' : 'file', stat.ino);
  }
  class Handle {
    constructor(filePath, kind, ino) {
      this.path = filePath; this.name = path.basename(filePath); this.kind = kind; this.ino = ino;
    }
    check(action) {
      const error = faults.get(`${action}:${this.path}`);
      if (error) throw error;
    }
    async isSameEntry(other) { return this.ino === other.ino; }
    async queryPermission() { return faults.has(`permission:${this.path}`) ? 'denied' : 'granted'; }
    async requestPermission() { return this.queryPermission(); }
    async resolve(other) {
      const relative = path.relative(this.path, other.path);
      return relative === '' ? [] : relative.startsWith('..') ? null : relative.split(path.sep);
    }
    async *values() {
      this.check('list');
      for (const name of await fs.readdir(this.path)) yield await makeHandle(path.join(this.path, name));
    }
    async child(name, kind, create) {
      this.check('probe');
      const filePath = path.join(this.path, name);
      let handle;
      try { handle = await makeHandle(filePath); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (!create) throw failure('NotFoundError');
        if (kind === 'directory') await fs.mkdir(filePath);
        else await fs.writeFile(filePath, '');
        handle = await makeHandle(filePath);
      }
      if (handle.kind !== kind) throw failure('TypeMismatchError');
      return handle;
    }
    getFileHandle(name, options) { return this.child(name, 'file', options?.create); }
    getDirectoryHandle(name, options) { return this.child(name, 'directory', options?.create); }
    async getFile() {
      this.check('read');
      return new File([await fs.readFile(this.path)], this.name, { lastModified: 1700000000000 });
    }
    async createWritable() {
      this.check('write');
      let data = Buffer.alloc(0);
      return {
        write: async value => {
          data = typeof value === 'string' ? Buffer.from(value)
            : value instanceof ArrayBuffer ? Buffer.from(value)
            : ArrayBuffer.isView(value) ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
            : Buffer.from(await value.arrayBuffer());
          this.check('stream');
        },
        close: async () => { this.check('close'); await fs.writeFile(this.path, data); },
        abort: async () => { data = Buffer.alloc(0); },
      };
    }
    async removeEntry(name) {
      this.check('remove');
      await fs.rm(path.join(this.path, name), { recursive: true });
    }
  }
  return {
    root, faults,
    handle: makeHandle,
    ref: async filePath => ({ backend: 'web', name: path.basename(filePath), handle: await makeHandle(filePath) }),
    mkdir: async name => { const dest = path.join(root, name); await fs.mkdir(dest, { recursive: true }); return dest; },
    write: async (name, bytes) => { const dest = path.join(root, name); await fs.writeFile(dest, bytes); return dest; },
  };
}

let serial = 0;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText).toString('base64')}`;
async function pathUtilUrl() {
  return moduleUrl(await fs.readFile(new URL('../src/core/pathutil.ts', import.meta.url), 'utf8'));
}
async function archiveUrl() {
  const source = (await fs.readFile(new URL('../src/core/archive.ts', import.meta.url), 'utf8'))
    .replace("from 'fflate'", `from '${import.meta.resolve('fflate')}'`)
    .replace("from './pathutil'", `from '${await pathUtilUrl()}'`);
  return moduleUrl(source);
}
export async function loadFs(native = false, plugin = {}, guard = {}) {
  const source = process.env.GK_BASELINE
    ? execFileSync('git', ['show', `${process.env.GK_BASELINE}:src/core/fs.ts`], { encoding: 'utf8' })
    : await fs.readFile(new URL('../src/core/fs.ts', import.meta.url), 'utf8');
  const key = `__gkTest${serial++}`;
  globalThis[key] = {
    Capacitor: { isNativePlatform: () => native, convertFileSrc: uri => uri },
    registerPlugin: () => ({
      inspectDirectory: async ({ path }) => {
        const result = await plugin.readdir({ path });
        return { canonicalUri: new URL(path).href.replace(/\/+$/, ''), files: result.files.map(file => ({
          ...file, uri: `${path.replace(/\/+$/, '')}/${file.name}`, nativeId: file.name,
        })) };
      },
      verifyTree: async () => {},
      verifyCopy: async () => {},
      ...guard,
    }),
    Directory: { ExternalStorage: 'EXTERNAL_STORAGE', Documents: 'DOCUMENTS', Cache: 'CACHE' },
    Filesystem: plugin,
  };
  const patched = source
    .replace(/import \{ Capacitor(?:, registerPlugin)? \} from '@capacitor\/core';/, `const { Capacitor, registerPlugin } = globalThis.${key};`)
    .replace("import { Directory, Filesystem } from '@capacitor/filesystem';", `const { Directory, Filesystem } = globalThis.${key};`)
    .replace("from './pathutil'", `from '${await pathUtilUrl()}'`);
  const js = ts.transpileModule(patched, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

export async function loadStore(adapter) {
  const source = process.env.GK_BASELINE
    ? execFileSync('git', ['show', `${process.env.GK_BASELINE}:src/store/explorerStore.ts`], { encoding: 'utf8' })
    : await fs.readFile(new URL('../src/store/explorerStore.ts', import.meta.url), 'utf8');
  const key = `__gkStoreTest${serial++}`;
  globalThis[key] = { create, getAdapter: () => adapter };
  const patched = source
    .replace("import { create } from 'zustand';", `const { create } = globalThis.${key};`)
    .replace("import { getAdapter } from '../core/fs';", `const { getAdapter } = globalThis.${key};`)
    .replace("from '../core/archive'", `from '${await archiveUrl()}'`)
    .replace("from '../core/windowLayout'", `from '${moduleUrl(await fs.readFile(new URL('../src/core/windowLayout.ts', import.meta.url), 'utf8'))}'`);
  const js = ts.transpileModule(patched, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
