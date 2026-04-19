/**
 * fchange [--pkg <name>] <type> ["message"]
 *
 * Prepends a change entry under [Unreleased] in the project's CHANGELOG.md.
 * Types follow Keep a Changelog: added, changed, deprecated, removed, fixed, security.
 * Configure via fchange.mjs, fchange.json, .fchangerc, or package.json "fchange" key.
 *
 * Subcommands:
 *   fchange --init                Create an empty fchange.json in the current directory
 *   fchange completion <bash>     Print shell completion script
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { prependEntry, type SectionType } from '../libs/changelog.mts';
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

const SECTIONS = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'] as const;
type SectionInput = (typeof SECTIONS)[number];

function toSectionType(input: SectionInput): SectionType {
  return (input.charAt(0).toUpperCase() + input.slice(1)) as SectionType;
}

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

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log(`\
fchange <type> ["message"] [--pkg <name>]

Prepend a change entry to CHANGELOG.md under ## [Unreleased].
Opens $EDITOR if message is omitted.

Types (Keep a Changelog):
  added        New feature           (implies minor bump)
  changed      Changed behaviour     (implies minor bump)
  deprecated   Soon-to-be removed    (implies minor bump)
  removed      Removed feature       (implies major bump)
  fixed        Bug fix               (implies patch bump)
  security     Security fix          (implies patch bump)

Options:
  --pkg, -p <name>   Target package (required when folders are configured)
  --version, -v      Print version
  --help, -h         Show this help

Subcommands:
  --init             Create fchange.json in the current directory
  completion bash    Print bash completion script

Config: fchange.mjs, fchange.json, .fchangerc, or package.json "fchange" key`);
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
    const opts = hasFolders && !pkgAlreadySet ? ['--pkg', ...SECTIONS] : [...SECTIONS];
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

const [sectionInput, ...rest] = positionals;

if (!sectionInput) {
  const usage = hasFolders
    ? `fchange <type> ["message"] --pkg <name>`
    : `fchange <type> ["message"]`;
  console.error(`Usage: ${usage}\nTypes: ${SECTIONS.join(', ')}`);
  process.exit(1);
}

if (!(SECTIONS as readonly string[]).includes(sectionInput)) {
  console.error(`Invalid type "${sectionInput}". Use: ${SECTIONS.join(', ')}`);
  process.exit(1);
}

const section = toSectionType(sectionInput as SectionInput);
const ctx = pkg ? `fchange ${sectionInput} --pkg ${pkg}` : `fchange ${sectionInput}`;
const message = rest.length > 0 ? rest.join(' ') : openInEditor(ctx);

if (!message) {
  const usage = hasFolders
    ? `fchange <type> "<message>" --pkg <name>`
    : `fchange <type> "<message>"`;
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

prependEntry(changelogPath, section, message);
console.log(
  `${path.relative(root, changelogPath).replace(/\\/g, '/')}\n  + [${section}] ${message}`,
);
