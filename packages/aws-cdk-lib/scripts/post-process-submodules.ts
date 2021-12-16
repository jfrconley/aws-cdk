// import * as os from 'os';
// import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import * as esbuild from 'esbuild';
import * as fs from 'fs-extra';

/* eslint-disable no-console */

async function main() {
  const rootDir = path.join(__dirname, '..');

  const rootEntries = await fs.readdir(rootDir);
  for (const entry of rootEntries) {
    const submodulePath = path.join(rootDir, entry);
    if ((await fs.stat(submodulePath)).isDirectory()
      && fs.existsSync(path.join(submodulePath, 'index.ts'))) {
      await minifySubmodule(submodulePath);
    }
  }
}

async function bundleOnceAndCollectMetadata(submodulePath: string) {
  const tmpDir = await fs.mkdtemp(submodulePath);
  const results = await esbuild.build({
    entryPoints: [path.join(submodulePath, 'index.ts')],
    platform: 'node',
    bundle: true,
    minifyWhitespace: true,
    minifySyntax: true,
    sourcemap: 'external',
    outdir: tmpDir,
    logLevel: 'error',
    metafile: true,
  });
  return results.metafile!;
}

async function minifySubmodule(submodulePath: string) {
  const submoduleName = path.basename(submodulePath);
  const metafile = await bundleOnceAndCollectMetadata(submodulePath);
  const externalImports = new Set<string>();
  [...Object.entries(metafile.inputs)].forEach(([_, data]) => {
    data.imports.filter(x => !x.path.startsWith(`${submoduleName}/`))
      .map(x => x.path)
      .forEach(x => externalImports.add(x));
  });

  await esbuild.build({
    entryPoints: [path.join(submodulePath, 'index.ts')],
    platform: 'node',
    bundle: true,
    minifyWhitespace: true,
    minifySyntax: true,
    sourcemap: 'external',
    outdir: submodulePath,
    logLevel: 'error',
    external: Array.from(externalImports.values()),
  });

  async function recursivelyCleanFolder(target: string) {
    console.error(`Recursively cleaning ${target}`);
    const dirEntries = await fs.readdir(target);
    for (const entry of dirEntries) {
      const fullPath = path.join(target, entry);
      if ((await fs.stat(fullPath)).isDirectory()) {
        await recursivelyCleanFolder(fullPath);
      } else if (entry.endsWith('.js') || (entry.endsWith('.ts') && !entry.endsWith('.d.ts'))) {
        await fs.unlink(fullPath);
      }
    }
  }

  await fs.unlink(path.join(submodulePath, 'index.ts'));
  await recursivelyCleanFolder(path.join(submodulePath, 'lib'));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});
