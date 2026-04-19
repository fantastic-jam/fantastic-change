# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build        # bundle .mts → .bin/ via rolldown
pnpm test         # vitest unit tests
pnpm typecheck    # type-check with tsgo (no emit)
pnpm lint         # biome lint
pnpm format       # biome format (writes)
pnpm check        # biome lint + format (writes)
pnpm release      # build, frelease, bump package.json, commit, tag, push → triggers npm publish
```

Smoke-test a tool directly (requires a fchange.json or .fchangerc in cwd):

```bash
node --experimental-strip-types src/fchange/fchange.mts fixed "test message"
node --experimental-strip-types src/fcommit/fcommit.mts feat "test message"
```

## Architecture

Three CLI tools sharing a common library layer under `src/libs/`:

- `src/libs/config.mts` — `ConfigLoader` interface, four implementations (`FChangeMjsLoader`, `FChangeJsonLoader`, `FChangeRcLoader`, `PackageJsonLoader`), `loadConfig`, `findRootAndConfig`
- `src/libs/changelog.mts` — pure functions (`prependEntryToContent`, `bumpVersion`, `computeRelease`) + impure wrappers (`prependEntry`, `releaseChangelog`)
- `src/libs/validate.mts` — pure `validateCommitMessage(subject, types)`
- `src/libs/shared.mts` — `allNames`, `resolveChangelog`, `renderCommitFormat`, completion helpers, `openInEditor`

`rolldown` bundles all three to `.bin/` for npm publishing.

### Config discovery

`findRootAndConfig` walks up from `cwd` trying loaders at each directory in order:
1. `fchange.mjs` / `fchange.js` (ESM default export)
2. `fchange.json`
3. `.fchangerc` (JSON)
4. `package.json` `"fchange"` key

Returns the first directory where any loader matches, or `null` if nothing is found.
`fchange` and `frelease` fail with an error if no config is found. `fcommit` falls back to defaults.

### fchange

- Fails if no config found (`--init` creates an empty `fchange.json`)
- Accepts a Keep a Changelog section type: `added`, `changed`, `deprecated`, `removed`, `fixed`, `security`
- Writes entry under `### <Section>` in `## [Unreleased]`, upgrading the level in the heading as needed
- Subcommands: `--init`, `completion bash`, `--complete`

### fcommit

- Only tool that requires git — calls `git rev-parse --git-dir` at startup
- Requires staged changes (does not auto-stage)
- Subcommands: `validate <file>` (commit-msg hook — validates subject against configured types), `completion bash`, `--complete`

### frelease

- Fails if no config found
- Reads current version from latest `## [x.y.z]` heading in CHANGELOG (defaults to `0.0.0`)
- Reads bump level from `## [Unreleased] - <level>` heading (set by `fchange`)
- Subcommands: `completion bash`, `--complete`

## Config

`.fchangerc` (JSON at repo root) controls both tools. See `.fchangerc.example` for all fields:

```json
{
  "folders": ["packages", "apps"],
  "commitFormat": "type(pkg): message",
  "types": ["feat", "fix", "chore"]
}
```

When `folders` is set, `--pkg <name>` is required. Package names are discovered by listing subdirectories of each folder.

## Git hooks (Husky)

- **pre-commit**: `biome check` on staged files
- **commit-msg**: `fcommit validate "$1"` — validates the commit message subject matches configured types/format from `.fchangerc`

## Code style (Biome)

- Single quotes, 2-space indent, 100-char line width, trailing commas
- `noExplicitAny`, `noNonNullAssertion`, `noVar` are errors — avoid them
- No unused imports/variables (errors)
