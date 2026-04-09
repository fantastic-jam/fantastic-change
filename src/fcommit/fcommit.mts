/**
 * fcommit [--pkg <name>] [--dry-run] <type> ["message"]
 *
 * Commits staged changes with a normalized conventional commit message.
 * Opens $EDITOR if message is omitted.
 * Configure via fchange.mjs, fchange.json, .fchangerc, or package.json "fchange" key.
 *
 * Subcommands:
 *   fcommit validate <file>       Validate commit message file against configured types (for git hooks)
 *   fcommit completion <bash>     Print shell completion script
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_COMMIT_FORMAT, DEFAULT_TYPES, findRootAndConfig } from '../libs/config.mts';
import {
  allNames,
  countPositionals,
  isPkgFlag,
  openInEditor,
  renderCommitFormat,
} from '../libs/shared.mts';
import { validateCommitMessage } from '../libs/validate.mts';

declare const __VERSION__: string;
function getVersion(): string {
  try {
    return __VERSION__;
  } catch {
    return '(dev)';
  }
}

// ── Git operations ────────────────────────────────────────────────────────────

function assertGitRepo(): void {
  const result = spawnSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    console.error('Not inside a git repository.');
    process.exit(1);
  }
}

function assertStaged(): void {
  const result = spawnSync('git', ['diff', '--cached', '--quiet'], { encoding: 'utf8' });
  if (result.error) {
    console.error('git diff failed:', result.error.message);
    process.exit(1);
  }
  if (result.status === 0) {
    console.error('Nothing staged. Stage your changes with git add before running fcommit.');
    process.exit(1);
  }
}

function gitCommit(message: string): void {
  const result = spawnSync('git', ['commit', '-m', message], { stdio: 'inherit' });
  if (result.error) {
    console.error('git commit failed:', result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

// ── Subcommands ───────────────────────────────────────────────────────────────

function handleCompletion(shell: string): void {
  if (shell !== 'bash') {
    console.error(`Unsupported shell "${shell}". Supported: bash`);
    process.exit(1);
  }
  console.log(`\
# fcommit bash completion — add to ~/.bashrc:
#   eval "$(fcommit completion bash)"
_fcommit_completions() {
  local cword=$((COMP_CWORD - 1))
  local completions
  completions=$(fcommit --complete "$cword" "\${COMP_WORDS[@]:1}" 2>/dev/null)
  COMPREPLY=($(compgen -W "$completions" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _fcommit_completions fcommit`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  console.log(getVersion());
  process.exit(0);
}

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`\
fcommit <type> ["message"] [--pkg <name>] [--dry-run]

Commit staged changes with a conventional commit message.
Opens $EDITOR if message is omitted.

Options:
  --pkg, -p <name>   Scope the commit to a package
  --dry-run, -n      Print the subject without committing
  --version, -v      Print version
  --help, -h         Show this help

Subcommands:
  validate <file>    Validate a commit-msg file (for use as a git hook)
  completion bash    Print bash completion script

Config: fchange.mjs, fchange.json, .fchangerc, or package.json "fchange" key`);
  process.exit(0);
}

if (rawArgs[0] === 'completion') {
  handleCompletion(rawArgs[1] ?? 'bash');
  process.exit(0);
}

if (rawArgs[0] === 'validate') {
  const msgFile = rawArgs[1];
  if (!msgFile) {
    console.error('Usage: fcommit validate <commit-msg-file>');
    process.exit(1);
  }
  if (!fs.existsSync(msgFile)) {
    console.error(`fcommit validate: file not found: ${msgFile}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(msgFile, 'utf8').trim();
  const subject = raw.split('\n')[0] ?? '';
  const foundCfg = await findRootAndConfig(process.cwd());
  if (!foundCfg) {
    console.error('No fchange config found.\n  Run: fchange --init');
    process.exit(1);
  }
  const { config, root } = foundCfg;
  const types = config.types ?? DEFAULT_TYPES;
  const validScopes = (config.folders?.length ?? 0) > 0 ? allNames(root, config) : null;
  const error = validateCommitMessage(subject, types, config.bypassPatterns, validScopes);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

assertGitRepo();

const found = await findRootAndConfig(process.cwd());
if (!found) {
  console.error('No fchange config found.\n  Run: fchange --init');
  process.exit(1);
}
const { root, config } = found;
const hasFolders = (config.folders?.length ?? 0) > 0;
const types = config.types ?? DEFAULT_TYPES;

if (rawArgs[0] === '--complete') {
  const cword = Number.parseInt(rawArgs[1] ?? '0', 10);
  const words = rawArgs.slice(2);
  const prev = cword > 0 ? words[cword - 1] : '';

  if (isPkgFlag(prev)) {
    console.log(allNames(root, config).join('\n'));
  } else if (countPositionals(words, cword) === 0) {
    const pkgAlreadySet = words.some(isPkgFlag);
    const opts = hasFolders && !pkgAlreadySet ? ['--pkg', ...types] : types;
    console.log(opts.join('\n'));
  }
  process.exit(0);
}

const { values, positionals } = parseArgs({
  args: rawArgs,
  options: {
    pkg: { type: 'string', short: 'p' },
    'dry-run': { type: 'boolean', short: 'n' },
  },
  allowPositionals: true,
});

const pkg = values.pkg ?? null;
const dryRun = values['dry-run'] ?? false;

if (pkg && hasFolders && !allNames(root, config).includes(pkg)) {
  console.error(`Unknown package "${pkg}".\n  Available: ${allNames(root, config).join(', ')}`);
  process.exit(1);
}

const [type, ...rest] = positionals;

if (!type) {
  const usage = hasFolders
    ? `fcommit <type> ["message"] [--pkg <name>]`
    : `fcommit <type> ["message"]`;
  console.error(`Usage: ${usage}\n  Types: ${types.join(', ')}`);
  process.exit(1);
}

if (!types.includes(type)) {
  console.error(`Invalid type "${type}".\n  Available: ${types.join(', ')}`);
  process.exit(1);
}

const ctx = pkg ? `fcommit ${type} --pkg ${pkg}` : `fcommit ${type}`;
const message = rest.length > 0 ? rest.join(' ') : openInEditor(ctx);

if (!message) {
  const usage = hasFolders
    ? `fcommit <type> "<message>" [--pkg <name>]`
    : `fcommit <type> "<message>"`;
  console.error(`Usage: ${usage}`);
  process.exit(1);
}

const subject = renderCommitFormat(
  config.commitFormat ?? DEFAULT_COMMIT_FORMAT,
  type,
  pkg,
  message,
);

if (dryRun) {
  console.log(`[dry-run] ${subject}`);
  process.exit(0);
}

assertStaged();
gitCommit(subject);
