/**
 * Native dynamic import that bypasses Jest's resolver.
 *
 * `ts-jest` (CJS mode) transpiles `await import(x)` into
 * `Promise.resolve().then(() => require(x))`, which routes through Jest's
 * own resolver and chokes on absolute `file://` URLs. The `new Function`
 * trick keeps the `import()` call literal so Node's native ESM loader picks
 * it up — this is what we want for genuinely loading our `.mjs` scripts.
 *
 * Usage requires `node --experimental-vm-modules` (already wired into the
 * `test` script in `package.json`).
 */
const nativeImport = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<unknown>;

export async function importEsm<T = unknown>(specifier: string): Promise<T> {
  return (await nativeImport(specifier)) as T;
}
