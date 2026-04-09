/**
 * frelease [--pkg <name>] [--dry-run]
 *
 * Reads [Unreleased] entries from CHANGELOG.md, determines the next version
 * from the highest bump level found, and promotes the section to [x.y.z] - YYYY-MM-DD.
 * Prints the new version to stdout.
 *
 * Current version is read from the latest versioned heading in the CHANGELOG itself.
 * Fails if there is no [Unreleased] section or it has no entries.
 *
 * Subcommands:
 *   frelease changelog [version]   Print release notes for latest (or specific) version
 *   frelease changelog-version     Print latest released version string
 *   frelease completion <bash>     Print shell completion script
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ChangelogError, extractVersionChangelog, releaseChangelog } from '../libs/changelog.mts';
import { findRootAndConfig } from '../libs/config.mts';
import { allNames, isPkgFlag, resolveChangelog } from '../libs/shared.mts';

declare const __VERSION__: string;
function getVersion(): string {
  try {
    return __VERSION__;
  } catch {
    return '(dev)';
  }
}

// ── Subcommands ───────────────────────────────────────────────────────────────

function handleCompletion(shell: string): void {
  if (shell !== 'bash') {
    console.error(`Unsupported shell "${shell}". Supported: bash`);
    process.exit(1);
  }
  console.log(`\
# frelease bash completion — add to ~/.bashrc:
#   eval "$(frelease completion bash)"
_frelease_completions() {
  local cword=$((COMP_CWORD - 1))
  local completions
  completions=$(frelease --complete "$cword" "\${COMP_WORDS[@]:1}" 2>/dev/null)
  COMPREPLY=($(compgen -W "$completions" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _frelease_completions frelease`);
}

const SUBCOMMANDS = ['changelog', 'changelog-version'];

// ── Entry point ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  console.log(getVersion());
  process.exit(0);
}

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`\
frelease [--pkg <name>] [--dry-run]

Promote ## [Unreleased] to a versioned heading in CHANGELOG.md and print the new version.
The version is bumped by the highest level (major > minor > patch) among unreleased entries.

Options:
  --pkg, -p <name>   Target package (required when folders are configured)
  --dry-run, -n      Print the version without writing
  --version, -v      Print version
  --help, -h         Show this help

Subcommands:
  changelog [ver]    Print release notes for the latest (or a specific) version
  changelog-version  Print the latest released version string
  completion bash    Print bash completion script

Config: fchange.mjs, fchange.json, .fchangerc, or package.json "fchange" key`);
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
  } else {
    const pkgAlreadySet = words.some(isPkgFlag);
    const subcommandSet = words.some((w) => SUBCOMMANDS.includes(w));
    const dryRunSet = words.includes('--dry-run') || words.includes('-n');
    const opts: string[] = [];
    if (hasFolders && !pkgAlreadySet) opts.push('--pkg');
    if (!subcommandSet) {
      opts.push(...SUBCOMMANDS);
      if (!dryRunSet) opts.push('--dry-run');
    }
    if (opts.length > 0) console.log(opts.join('\n'));
  }
  process.exit(0);
}

// ── Global argument parsing ───────────────────────────────────────────────────

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

if (!pkg && hasFolders) {
  console.error(`--pkg is required.\n  Available: ${allNames(root, config).join(', ')}`);
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

const [subcommand, versionArg] = positionals;

// ── Subcommand dispatch ───────────────────────────────────────────────────────

if (subcommand === 'changelog' || subcommand === 'changelog-version') {
  if (!fs.existsSync(changelogPath)) {
    console.error(`No CHANGELOG.md found at ${changelogPath}`);
    process.exit(1);
  }
  const version = subcommand === 'changelog' ? versionArg : undefined;
  const result = extractVersionChangelog(fs.readFileSync(changelogPath, 'utf8'), version);
  if (!result) {
    const msg = version
      ? `Version ${version} not found in CHANGELOG.`
      : 'No released version found in CHANGELOG.';
    console.error(msg);
    process.exit(1);
  }
  console.log(subcommand === 'changelog-version' ? result.version : result.notes);
  process.exit(0);
}

// ── Main release ──────────────────────────────────────────────────────────────

try {
  const newVersion = releaseChangelog(changelogPath, dryRun);
  if (dryRun) {
    console.error(`[dry-run] would release ${newVersion}`);
  } else {
    console.log(newVersion);
  }
} catch (err) {
  if (err instanceof ChangelogError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
