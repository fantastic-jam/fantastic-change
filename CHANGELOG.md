# Changelog

## [1.0.0] - 2026-04-19

### Added
- fcommit and fcommit validate now accept the Conventional Commits breaking change marker (feat!: or feat(scope)!:)
- bump level (patch/minor/major) stored once in ## [Unreleased] heading, auto-upgraded as entries are added
- Keep a Changelog section types: added, changed, deprecated, removed, fixed, security

### Removed
- fchange patch|minor|major level-per-entry format — replaced by Keep a Changelog section types

## [0.2.0] - 2026-04-09

### Added
- Help flag (`--help`/`-h`) for fchange, fcommit, and frelease
- fcommit validate now validates optional scope

## [0.1.0] - 2026-04-09

### Added
- Initial release
