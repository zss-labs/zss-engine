import * as fs from 'fs';
import * as path from 'path';

export type SourcePackage = {
  name: string;
  dir: string;
  exports: unknown;
  sourceDirs: string[];
};

const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', '.next']);
const SOURCE_FILE = /\.(js|jsx|ts|tsx)$/;

const readJson = (file: string): any => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const subpathMap = (exports: unknown) =>
  isObject(exports) && Object.keys(exports).some((key) => key.startsWith('.'))
    ? exports
    : null;

const sourceTarget = (entry: unknown): string | null =>
  isObject(entry) && typeof entry.plumeria === 'string' ? entry.plumeria : null;

const sourceDirsOf = (dir: string, exports: unknown): string[] => {
  const map = subpathMap(exports);
  const dirs = (map ? Object.values(map) : [exports])
    .map(sourceTarget)
    .filter((target): target is string => target !== null)
    .map((target) => {
      const star = target.indexOf('*');
      if (star === -1) return path.dirname(path.resolve(dir, target));
      const prefix = target.slice(0, star);
      return prefix.endsWith('/')
        ? path.resolve(dir, prefix)
        : path.dirname(path.resolve(dir, prefix));
    })
    .filter(
      (sourceDir) => sourceDir === dir || sourceDir.startsWith(dir + path.sep),
    );
  const unique = [...new Set(dirs)];
  return unique.filter(
    (sourceDir) =>
      !unique.some(
        (other) =>
          other !== sourceDir && sourceDir.startsWith(other + path.sep),
      ),
  );
};

const targetOf = (exports: unknown, subpath: string): string | null => {
  const map = subpathMap(exports);
  if (!map) return subpath === '.' ? sourceTarget(exports) : null;
  if (subpath in map) return sourceTarget(map[subpath]);
  let best: { key: string; matched: string } | null = null;
  for (const key of Object.keys(map)) {
    const star = key.indexOf('*');
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (
      suffix.includes('*') ||
      subpath.length < key.length ||
      !subpath.startsWith(prefix) ||
      !subpath.endsWith(suffix)
    ) {
      continue;
    }
    const bestStar = best ? best.key.indexOf('*') : -1;
    if (
      !best ||
      star > bestStar ||
      (star === bestStar && key.length >= best.key.length)
    ) {
      best = {
        key,
        matched: subpath.slice(prefix.length, subpath.length - suffix.length),
      };
    }
  }
  if (!best) return null;
  return sourceTarget(map[best.key])?.replace('*', best.matched) ?? null;
};

const findPackage = (root: string, name: string): SourcePackage | null => {
  for (let dir = root; ; dir = path.dirname(dir)) {
    const linked = path.join(dir, 'node_modules', name);
    if (fs.existsSync(linked)) {
      const real = fs.realpathSync(linked);
      const exports = readJson(path.join(real, 'package.json'))?.exports;
      const sourceDirs = sourceDirsOf(real, exports);
      return sourceDirs.length > 0
        ? { name, dir: real, exports, sourceDirs }
        : null;
    }
    if (path.dirname(dir) === dir) return null;
  }
};

export function sourcePackages(root: string): SourcePackage[] {
  const manifest = readJson(path.join(root, 'package.json')) ?? {};
  const names = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  }).sort();
  return names
    .map((name) => findPackage(root, name))
    .filter((pkg): pkg is SourcePackage => pkg !== null);
}

export function resolveSourcePackage(
  packages: SourcePackage[],
  id: string,
): string | null {
  for (const pkg of packages) {
    const subpath =
      id === pkg.name
        ? '.'
        : id.startsWith(`${pkg.name}/`)
          ? `.${id.slice(pkg.name.length)}`
          : null;
    if (subpath === null) continue;
    const target = targetOf(pkg.exports, subpath);
    return target ? path.resolve(pkg.dir, target) : null;
  }
  return null;
}

export function inSourcePackage(
  packages: SourcePackage[],
  file: string,
): boolean {
  return packages.some((pkg) =>
    pkg.sourceDirs.some((dir) => file.startsWith(dir + path.sep)),
  );
}

const filesIn = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) ? [] : filesIn(entryPath);
    }
    return SOURCE_FILE.test(entry.name) ? [entryPath] : [];
  });

export function sourcePackageFiles(packages: SourcePackage[]): string[] {
  return packages.flatMap((pkg) => pkg.sourceDirs.flatMap(filesIn));
}
