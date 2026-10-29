// Rewrites the tsc-emitted archive engine so Node's ESM loader can run it:
//  - add the .js extension to the relative ./pathutil import
//  - resolve the bare 'fflate' specifier to the installed ESM entry
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const target = new URL('./.compiled/archive.js', import.meta.url);
let src = readFileSync(target, 'utf8');

src = src.replace(/from '\.\/pathutil'/g, "from './pathutil.js'");

// Resolve fflate to an absolute file URL so the test runs regardless of cwd.
let fflateUrl;
try {
  fflateUrl = pathToFileURL(require.resolve('fflate')).href;
} catch {
  // Fall back to the esm browser build if the main resolution is unavailable.
  const guess = new URL('../node_modules/fflate/esm/browser.js', import.meta.url);
  if (existsSync(guess)) fflateUrl = guess.href;
}
if (fflateUrl) {
  src = src.replace(/from 'fflate'/g, `from '${fflateUrl}'`);
}

writeFileSync(target, src);
