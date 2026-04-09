import fs from 'node:fs';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Level = 'patch' | 'minor' | 'major';

const LEVEL_RANK: Record<Level, number> = { patch: 0, minor: 1, major: 2 };

export class ChangelogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangelogError';
  }
}

// ── Pure functions ────────────────────────────────────────────────────────────

export function bumpVersion(current: string, level: Level): string {
  const [major, minor, patch] = current.split('.').map(Number) as [number, number, number];
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function prependEntryToContent(content: string, level: string, message: string): string {
  const entry = `- ${level}: ${message}`;
  const UNRELEASED = '## [Unreleased]';

  if (content.includes(UNRELEASED)) {
    return content.replace(/(## \[Unreleased\]\n?)/, `$1${entry}\n`);
  }
  const titleEnd = content.startsWith('# ') ? content.indexOf('\n') + 1 : 0;
  return `${content.slice(0, titleEnd)}\n${UNRELEASED}\n${entry}\n${content.slice(titleEnd)}`;
}

/** Compute the next release from CHANGELOG content. Throws ChangelogError on invalid state. */
export function computeRelease(content: string): { newVersion: string; updatedContent: string } {
  const lines = content.split('\n');

  const unreleasedIdx = lines.findIndex((l) => /^## \[Unreleased\]/i.test(l));
  if (unreleasedIdx === -1) {
    throw new ChangelogError(
      'No [Unreleased] section found.\n  Run: fchange <patch|minor|major> "<message>"',
    );
  }

  let highestLevel: Level = 'patch';
  let hasEntries = false;

  for (let i = unreleasedIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) break;
    const match = /^- (patch|minor|major):/.exec(line);
    if (!match) continue;
    hasEntries = true;
    const level = match[1] as Level;
    if (LEVEL_RANK[level] > LEVEL_RANK[highestLevel]) highestLevel = level;
  }

  if (!hasEntries) {
    throw new ChangelogError(
      '[Unreleased] has no entries.\n  Run: fchange <patch|minor|major> "<message>"',
    );
  }

  let currentVersion = '0.0.0';
  for (const line of lines) {
    const match = /^## \[(\d+\.\d+\.\d+)\]/.exec(line);
    if (match) {
      currentVersion = match[1];
      break;
    }
  }

  const newVersion = bumpVersion(currentVersion, highestLevel);
  const date = new Date().toISOString().slice(0, 10);
  const updatedContent = content.replace(/^## \[Unreleased\]/m, `## [${newVersion}] - ${date}`);

  return { newVersion, updatedContent };
}

/** Extract release notes for a specific version (or the latest if omitted). */
export function extractVersionChangelog(
  content: string,
  version?: string,
): { version: string; notes: string } | null {
  const lines = content.split('\n');

  let startIdx = -1;
  let foundVersion = '';

  for (let i = 0; i < lines.length; i++) {
    const match = /^## \[(\d+\.\d+\.\d+)\]/.exec(lines[i]);
    if (!match) continue;
    if (version === undefined || match[1] === version) {
      startIdx = i;
      foundVersion = match[1];
      break;
    }
  }

  if (startIdx === -1) return null;

  const noteLines: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break;
    noteLines.push(lines[i]);
  }

  return { version: foundVersion, notes: noteLines.join('\n').trim() };
}

// ── Impure wrappers ───────────────────────────────────────────────────────────

export function prependEntry(changelogPath: string, level: string, message: string): void {
  const content = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, 'utf8')
    : '# Changelog\n';
  fs.writeFileSync(changelogPath, prependEntryToContent(content, level, message), 'utf8');
}

/** Read, compute, and optionally write the release. Throws ChangelogError on failure. */
export function releaseChangelog(changelogPath: string, dryRun: boolean): string {
  if (!fs.existsSync(changelogPath)) {
    throw new ChangelogError(`No CHANGELOG.md found at ${changelogPath}`);
  }
  const { newVersion, updatedContent } = computeRelease(fs.readFileSync(changelogPath, 'utf8'));
  if (!dryRun) fs.writeFileSync(changelogPath, updatedContent, 'utf8');
  return newVersion;
}
