import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  inSourcePackage,
  resolveSourcePackage,
  sourcePackageFiles,
  sourcePackages,
} from '../src/utils/source-packages';

describe('source packages', () => {
  let root: string;
  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  };
  beforeEach(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'source-packages-')),
    );
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('discovers sorted dependencies through ancestor node_modules and follows links', () => {
    const project = path.join(root, 'project', 'child');
    write(path.join(project, 'package.json'), {
      dependencies: { z: '*', missing: '*' },
      devDependencies: { a: '*' },
      peerDependencies: { a: '*' },
      optionalDependencies: { invalid: '*' },
    });
    const real = path.join(root, 'packages', 'a');
    write(path.join(real, 'package.json'), {
      exports: { plumeria: './src/index.ts' },
    });
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    fs.symlinkSync(real, path.join(root, 'node_modules', 'a'));
    write(path.join(root, 'node_modules/z/package.json'), {
      exports: {
        '.': { plumeria: './lib/index.ts' },
        './nested': { plumeria: './lib/nested/index.ts' },
        './outside': { plumeria: '../outside.ts' },
      },
    });
    write(path.join(root, 'node_modules/invalid/package.json'), '{');
    const packages = sourcePackages(project);
    expect(packages.map((p) => p.name)).toEqual(['a', 'z']);
    expect(packages[0]).toMatchObject({
      dir: fs.realpathSync(real),
      sourceDirs: [path.join(real, 'src')],
    });
    expect(packages[1].sourceDirs).toEqual([
      path.join(root, 'node_modules/z/lib'),
    ]);
    expect(resolveSourcePackage(packages, 'a')).toBe(
      path.join(real, 'src/index.ts'),
    );
    expect(resolveSourcePackage(packages, 'a/other')).toBeNull();
    expect(resolveSourcePackage(packages, 'unknown')).toBeNull();
    expect(sourcePackages(path.join(root, 'absent'))).toEqual([]);
  });

  test('resolves exact and most specific wildcard exports', () => {
    write(path.join(root, 'package.json'), { dependencies: { pkg: '*' } });
    write(path.join(root, 'node_modules/pkg/package.json'), {
      exports: {
        '.': { plumeria: './index.ts' },
        './exact': { plumeria: './exact.ts' },
        './*': { plumeria: './src/*.ts' },
        './feature/*': { plumeria: './feature/*/index.ts' },
        './feature/*.special': { plumeria: './special/*.ts' },
        './bad/**': { plumeria: './bad/*.ts' },
        './none': { default: './index.js' },
        './empty': { plumeria: '' },
      },
    });
    const packages = sourcePackages(root);
    const base = path.join(root, 'node_modules/pkg');
    expect(resolveSourcePackage(packages, 'pkg')).toBe(
      path.join(base, 'index.ts'),
    );
    expect(resolveSourcePackage(packages, 'pkg/exact')).toBe(
      path.join(base, 'exact.ts'),
    );
    expect(resolveSourcePackage(packages, 'pkg/feature/foo')).toBe(
      path.join(base, 'feature/foo/index.ts'),
    );
    expect(resolveSourcePackage(packages, 'pkg/feature/foo.special')).toBe(
      path.join(base, 'special/foo.ts'),
    );
    expect(resolveSourcePackage(packages, 'pkg/none')).toBeNull();
    expect(resolveSourcePackage(packages, 'pkg/empty')).toBeNull();
    expect(resolveSourcePackage(packages, 'pkg-other')).toBeNull();
  });

  test('enumerates source files recursively while skipping generated directories', () => {
    write(path.join(root, 'package.json'), { dependencies: { pkg: '*' } });
    const base = path.join(root, 'node_modules/pkg');
    write(path.join(base, 'package.json'), {
      exports: { './*': { plumeria: './src/*' } },
    });
    for (const file of [
      'a.js',
      'b.jsx',
      'c.ts',
      'd.tsx',
      'nested/e.ts',
      'other.json',
      'dist/x.ts',
      'build/x.ts',
      '.next/x.ts',
      'node_modules/x.ts',
    ])
      write(path.join(base, 'src', file), '');
    const packages = sourcePackages(root);
    expect(
      sourcePackageFiles(packages)
        .map((f) => path.relative(path.join(base, 'src'), f))
        .sort(),
    ).toEqual(['a.js', 'b.jsx', 'c.ts', 'd.tsx', 'nested/e.ts']);
    expect(inSourcePackage(packages, path.join(base, 'src/a.ts'))).toBe(true);
    expect(inSourcePackage(packages, path.join(base, 'src'))).toBe(false);
    expect(inSourcePackage(packages, path.join(base, 'src-other/a.ts'))).toBe(
      false,
    );
  });
});
