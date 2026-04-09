import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CommitFormatter, FConfig } from './config.mts';

// ── Package discovery ─────────────────────────────────────────────────────────

export function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((e) => !e.startsWith('.') && fs.statSync(path.join(dir, e)).isDirectory());
}

export function allNames(repoRoot: string, config: FConfig): string[] {
  const resolvedRoot = path.resolve(repoRoot);
  const safeFolders = (config.folders ?? []).filter((f) => {
    const resolved = path.resolve(repoRoot, f);
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
  });
  return safeFolders.flatMap((f) => listDirs(path.join(repoRoot, f)));
}

export function resolveChangelog(repoRoot: string, name: string, config: FConfig): string | null {
  const folders = config.folders?.length ? config.folders : ['.'];
  const resolvedRoot = path.resolve(repoRoot);
  for (const folder of folders) {
    const candidate = path.resolve(repoRoot, folder, name);
    if (!candidate.startsWith(resolvedRoot + path.sep)) continue;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return path.join(candidate, 'CHANGELOG.md');
    }
  }
  return null;
}

// ── Commit format ─────────────────────────────────────────────────────────────

export function renderCommitFormat(
  format: string | CommitFormatter,
  type: string,
  pkg: string | null,
  message: string,
): string {
  if (typeof format === 'function') return format(type, pkg, message);
  return format
    .replace(/\(\{pkg\}\)/g, pkg ? `(${pkg})` : '')
    .replace(/\{pkg\}/g, pkg ?? '')
    .replace(/\{type\}/g, type)
    .replace(/\{message\}/g, message);
}

// ── Completion helpers ────────────────────────────────────────────────────────

export function isPkgFlag(w: string): boolean {
  return w === '--pkg' || w === '-p';
}

export function countPositionals(words: string[], endIdx: number): number {
  let count = 0;
  let i = 0;
  while (i < endIdx) {
    if (isPkgFlag(words[i])) {
      i += 2;
    } else if (words[i].startsWith('-')) {
      i++;
    } else {
      count++;
      i++;
    }
  }
  return count;
}

// ── Editor ────────────────────────────────────────────────────────────────────

export function openInEditor(context: string): string {
  const editorEnv =
    process.env.VISUAL ?? process.env.EDITOR ?? (process.platform === 'win32' ? 'notepad' : 'vi');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fchange-'));
  const tmpFile = path.join(tmpDir, 'message.txt');

  fs.writeFileSync(
    tmpFile,
    `\n# ${context}\n# Lines starting with '#' are ignored. Empty message aborts.\n`,
    'utf8',
  );

  const result = spawnSync(editorEnv, [tmpFile], { shell: true, stdio: 'inherit' });

  const raw = fs.readFileSync(tmpFile, 'utf8');
  try {
    fs.rmSync(tmpDir, { recursive: true });
  } catch {
    /* ignore */
  }

  if (result.error) {
    console.error(`Failed to open editor "${editorEnv}": ${result.error.message}`);
    process.exit(1);
  }

  return raw
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
}
