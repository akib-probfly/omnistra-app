import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../..');
const requireNative = createRequire(import.meta.url);

// Exercise application TypeScript with explicit native adapters; no emulator or
// additional test/transpiler dependency is required for these state regressions.
export function application(overrides = {}) {
  const cache = new Map();
  function load(relative) {
    const normalized = relative.replaceAll('\\', '/').replace(/\.(tsx?|mjs)$/, '');
    if (normalized in overrides) return overrides[normalized];
    let file = path.resolve(root, relative);
    if (!existsSync(file) || !statSync(file).isFile()) file = ['.ts', '.tsx'].map((ext) => file + ext).find(existsSync);
    if (!file) throw new Error(`Missing module ${relative}`);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const require = (name) => {
      if (name in overrides) return overrides[name];
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), name)));
      return requireNative(name);
    };
    vm.runInNewContext(code, { require, module, exports: module.exports, console, Date, JSON, URL,
      setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, atob: globalThis.atob, __DEV__: false, process }, { filename: file });
    return module.exports;
  }
  return load;
}
