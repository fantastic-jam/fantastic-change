# fantastic-change

Three small CLI tools for changelog and commit hygiene.

| Tool | Purpose |
|---|---|
| `fchange` | Append a change entry to `CHANGELOG.md` under `## [Unreleased]` |
| `fcommit` | Commit staged changes with a conventional commit message |
| `frelease` | Promote `## [Unreleased]` to a versioned heading and print the new version |

Changelogs follow the [Keep a Changelog](https://keepachangelog.com) format. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

Requires Node.js >= 22.7.0.

## Install

```bash
npm install -g @fantastic-jam/fchange
```

## Setup

Run once in your project root to create a config file:

```bash
fchange --init
```

Then edit `fchange.json` to configure your types, commit format, and (for monorepos) package folders.

## Shell completions

Add to your `~/.bashrc`:

```bash
eval "$(fchange completion bash)"
eval "$(fcommit completion bash)"
eval "$(frelease completion bash)"
```

Then reload: `source ~/.bashrc`

---

## fchange

Records what changed. Writes an entry under `## [Unreleased]` in `CHANGELOG.md` using [Keep a Changelog](https://keepachangelog.com) section types.

```bash
fchange added    "add dark mode"
fchange changed  "rename --verbose to --debug"
fchange deprecated "legacy API endpoint"
fchange removed  "drop Node 18 support"
fchange fixed    "fix crash on startup"
fchange security "patch XSS in render path"
```

The section type implies the version bump applied at release time:

| Type | Bump |
|---|---|
| `added`, `changed`, `deprecated` | minor |
| `removed` | major |
| `fixed`, `security` | patch |

The bump level is stored once in the `## [Unreleased]` heading and automatically upgraded as you add entries — no need to track it per line. `frelease` reads it from there.

Omit the message to open `$EDITOR`:

```bash
fchange fixed
```

If `CHANGELOG.md` doesn't exist, it is created. If there is no `## [Unreleased]` section, one is added.

---

## fcommit

Commits whatever is currently staged. Does not auto-stage.

Commit subjects follow the [Conventional Commits](https://www.conventionalcommits.org/) format: `<type>[(scope)][!]: <message>`. The `!` marker signals a breaking change.

```bash
git add -p
fcommit feat "add search"
fcommit fix "handle empty input"
fcommit fix                           # opens $EDITOR for the message
fcommit feat "add search" --dry-run   # print subject without committing
fcommit feat! "drop Node 18 support"  # breaking change
```

The commit subject is built from the configured `commitFormat` (default: `{type}({pkg}): {message}`).

### Validate commit messages (git hook)

Use `fcommit validate` as a `commit-msg` hook to enforce your configured types on every commit:

```sh
# .husky/commit-msg (or .git/hooks/commit-msg)
fcommit validate "$1"
```

Validates `<type>[(scope)][!]: <message>` against the types in your config. Merge commits, revert commits, `fixup!`, and `squash!` are always allowed. Additional bypass patterns can be configured with `bypassPatterns`.

---

## frelease

Promotes `## [Unreleased]` to a versioned heading. The new version is determined by the bump level stored in the `## [Unreleased] - <level>` heading, which `fchange` maintains automatically. The current version is read from the most recent versioned heading in the CHANGELOG — no `package.json` required.

```bash
frelease             # write CHANGELOG.md and print the new version
frelease --dry-run   # print the version without writing
```

### Read back release metadata

After promoting, use these to script a GitHub release:

```bash
frelease changelog-version   # print the latest released version (e.g. 1.2.0)
frelease changelog           # print the release notes for the latest version
frelease changelog 1.1.0     # print the release notes for a specific version
```

### Example release workflow

If you're using this repo's own tooling, `pnpm release` does everything: builds, promotes `[Unreleased]`, bumps `package.json`, commits, tags, and pushes (which triggers npm publish via CI).

Otherwise, manually:

```bash
VERSION=$(frelease)
# bump package.json, commit, push...
gh release create "v$(frelease changelog-version)" \
  --notes "$(frelease changelog)"
```

---

## Monorepo

When `folders` is set in the config, `--pkg <name>` is required. Package names are discovered by listing subdirectories of each configured folder. `--pkg` is a global flag — it works with all subcommands.

```bash
fchange added "add search" --pkg my-app
fcommit feat "add search" --pkg my-app
frelease --pkg my-app
frelease --pkg my-app changelog
frelease --pkg my-app changelog-version
```

---

## Configuration

Run `fchange --init` to create `fchange.json`, or create one of the following manually (checked in this order):

1. `fchange.mjs` / `fchange.js` — ESM module with a default export
2. `fchange.json`
3. `.fchangerc` — JSON
4. `package.json` — `"fchange"` key

```json
{
  "folders": ["packages", "apps"],
  "commitFormat": "{type}({pkg}): {message}",
  "types": ["feat", "fix", "chore", "docs", "refactor", "ci"],
  "bypassPatterns": ["v*.*.*", "Release *"]
}
```

| Field | Description | Default |
|---|---|---|
| `folders` | Directories containing packages. When set, `--pkg` is required. | `[]` |
| `commitFormat` | Commit subject template. Tokens: `{type}`, `{pkg}`, `{message}`. `({pkg})` collapses to nothing when no package is given. | `"{type}({pkg}): {message}"` |
| `types` | Allowed commit types for `fcommit` and `fcommit validate`. | `["feat","fix","chore","docs","refactor","ci"]` |
| `bypassPatterns` | Glob patterns that skip commit message validation (e.g. version tags). Case-insensitive. | `[]` |

### Function commit format (`fchange.mjs` only)

In a `.mjs` config, `commitFormat` can be a function:

```js
// fchange.mjs
export default {
  commitFormat: (type, pkg, message) =>
    pkg ? `${type}(${pkg}): ${message}` : `${type}: ${message}`,
};
```
