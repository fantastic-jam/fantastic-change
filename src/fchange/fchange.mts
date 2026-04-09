/**
 * fchange [--pkg <name>] <patch|minor|major> ["message"]
 *
 * Prepends a change entry under [Unreleased] in the project's CHANGELOG.md.
 * Configure via fchange.mjs, fchange.json, .fchangerc, or package.json "fchange" key.
 *
 * Subcommands:
 *   fchange --init                Create an empty fchange.json in the current directory
 *   fchange completion <bash>     Print shell completion script
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prependEntry } from '../libs/changelog.mts';
import { findRootAndConfig } from '../libs/config.mts';
import {
  allNames,
  countPositionals,
  isPkgFlag,
  openInEditor,
  resolveChangelog,
} from '../libs/shared.mts';

declare const __VERSION__: string;
function getVersion(): string {
  try {
    return __VERSION__;
  } catch {
    return '(dev)';
  }
}

const LEVELS = ['patch', 'minor', 'major'];

// ── Subcommands ───────────────────────────────────────────────────────────────

function handleCompletion(shell: string): void {
  if (shell !== 'bash') {
    console.error(`Unsupported shell "${shell}". Supported: bash`);
    process.exit(1);
  }
  console.log(`\
# fchange bash completion — add to ~/.bashrc:
#   eval "$(fchange completion bash)"
_fchange_completions() {
  local cword=$((COMP_CWORD - 1))
  local completions
  completions=$(fchange --complete "$cword" "\${COMP_WORDS[@]:1}" 2>/dev/null)
  COMPREPLY=($(compgen -W "$completions" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _fchange_completions fchange`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  console.log(getVersion());
  process.exit(0);
}

if (rawArgs[0] === '--init') {
  const initPath = path.join(process.cwd(), 'fchange.json');
  if (fs.existsSync(initPath)) {
    console.error(`fchange.json already exists in ${process.cwd()}`);
    process.exit(1);
  }
  fs.writeFileSync(initPath, '{}\n', 'utf8');
  console.log('Created fchange.json — edit it to configure types, commitFormat, and folders.');
  process.exit(0);
}

if (rawArgs[0] === 'completion') {
  handleCompletion(rawArgs[1] ?? 'bash');
  process.exit(0);
}

const found = await findRootAndConfig(process.cwd());
if (!found) {
  console.error('No fchange config found.\n  Run: fchange --init');
  process.exit(1);
}
const { root, config } = found;
const hasFolders = (config.folders?.length ?? 0) > 0;

if (rawArgs[0] === '--complete') {
  const cword = Number.parseInt(rawArgs[1] ?? '0', 10);
  const words = rawArgs.slice(2);
  const prev = cword > 0 ? words[cword - 1] : '';

  if (isPkgFlag(prev)) {
    console.log(allNames(root, config).join('\n'));
  } else if (countPositionals(words, cword) === 0) {
    const pkgAlreadySet = words.some(isPkgFlag);
    const opts = hasFolders && !pkgAlreadySet ? ['--pkg', ...LEVELS] : LEVELS;
    console.log(opts.join('\n'));
  }
  process.exit(0);
}

const { values, positionals } = parseArgs({
  args: rawArgs,
  options: { pkg: { type: 'string', short: 'p' } },
  allowPositionals: true,
});

const pkg = values.pkg ?? null;

if (!pkg && hasFolders) {
  console.error(`--pkg is required.\n  Available: ${allNames(root, config).join(', ')}`);
  process.exit(1);
}

const [level, ...rest] = positionals;

if (!level) {
  const usage = hasFolders
    ? `fchange <patch|minor|major> ["message"] --pkg <name>`
    : `fchange <patch|minor|major> ["message"]`;
  console.error(`Usage: ${usage}`);
  process.exit(1);
}

if (!LEVELS.includes(level)) {
  console.error(`Invalid level "${level}". Use: patch, minor, major`);
  process.exit(1);
}

const ctx = pkg ? `fchange ${level} --pkg ${pkg}` : `fchange ${level}`;
const message = rest.length > 0 ? rest.join(' ') : openInEditor(ctx);

if (!message) {
  const usage = hasFolders
    ? `fchange <patch|minor|major> "<message>" --pkg <name>`
    : `fchange <patch|minor|major> "<message>"`;
  console.error(`Usage: ${usage}`);
  process.exit(1);
}

let changelogPath: string;
if (pkg) {
  const resolved = resolveChangelog(root, pkg, config);
  if (!resolved) {
    console.error(`Unknown project "${pkg}".\n  Available: ${allNames(root, config).join(', ')}`);
    process.exit(1);
  }
  changelogPath = resolved;
} else {
  changelogPath = path.join(root, 'CHANGELOG.md');
}

prependEntry(changelogPath, level, message);
console.log(
  `${path.relative(root, changelogPath).replace(/\\/g, '/')}\n  + - ${level}: ${message}`,
);
