/**
 * Release script — run via `pnpm release` (which builds first).
 * Calls the bundled .bin/ binaries produced by rolldown.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function run(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
  if (result.error) {
    console.error(`Failed: ${cmd} ${args.join(' ')}\n${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function capture(args: string[], bin: string): string {
  const result = spawnSync('node', [path.join(root, '.bin', bin), ...args], {
    encoding: 'utf8',
    cwd: root,
  });
  if (result.error) {
    console.error(`Failed: ${bin} ${args.join(' ')}\n${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

// 1. Promote [Unreleased] → [x.y.z] and get new version
const version = capture([], 'frelease');
console.log(`Releasing v${version}`);

// 2. Update package.json version
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

// 3. Stage CHANGELOG.md and package.json
run('git', ['add', 'CHANGELOG.md', 'package.json']);

// 4. Commit
run('node', [path.join(root, '.bin', 'fcommit'), 'chore', `release v${version}`]);

// 5. Tag
run('git', ['tag', `v${version}`]);

// 6. Push commit and tag
run('git', ['push']);
run('git', ['push', 'origin', `v${version}`]);

console.log(`\nReleased v${version}`);
