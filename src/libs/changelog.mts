import fs from 'node:fs';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Level = 'patch' | 'minor' | 'major';

export type SectionType = 'Added' | 'Changed' | 'Deprecated' | 'Removed' | 'Fixed' | 'Security';

/** Keep a Changelog section order */
export const SECTION_ORDER: SectionType[] = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
];

/** Default bump level implied by each section type */
export const SECTION_LEVEL: Record<SectionType, Level> = {
  Added: 'minor',
  Changed: 'minor',
  Deprecated: 'minor',
  Removed: 'major',
  Fixed: 'patch',
  Security: 'patch',
};

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

function createUnreleasedBlock(
  content: string,
  level: Level,
  sectionHeading: string,
  entry: string,
): string {
  const titleEnd = content.startsWith('# ') ? content.indexOf('\n') + 1 : 0;
  const newBlock = `\n## [Unreleased] - ${level}\n\n${sectionHeading}\n${entry}\n`;
  return `${content.slice(0, titleEnd)}${newBlock}${content.slice(titleEnd)}`;
}

function resolvedLevel(current: Level | undefined, implied: Level): Level {
  return !current || LEVEL_RANK[implied] > LEVEL_RANK[current] ? implied : current;
}

function blockEnd(lines: string[], from: number): number {
  for (let i = from + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) return i;
  }
  return lines.length;
}

function insertSectionInOrder(
  lines: string[],
  section: SectionType,
  sectionHeading: string,
  entry: string,
  start: number,
  end: number,
): void {
  const rank = SECTION_ORDER.indexOf(section);

  for (let i = start; i < end; i++) {
    if (lines[i].startsWith('### ')) {
      const existingRank = SECTION_ORDER.indexOf(lines[i].slice(4) as SectionType);
      if (existingRank > rank) {
        lines.splice(lines[i - 1] === '' ? i - 1 : i, 0, '', sectionHeading, entry);
        return;
      }
    }
  }

  // Append at end of block
  let tail = end;
  while (tail > start && lines[tail - 1] === '') tail--;
  lines.splice(tail, 0, '', sectionHeading, entry);
}

export function prependEntryToContent(
  content: string,
  section: SectionType,
  message: string,
): string {
  const impliedLevel = SECTION_LEVEL[section];
  const entry = `- ${message}`;
  const sectionHeading = `### ${section}`;

  const lines = content.split('\n');
  const unreleasedIdx = lines.findIndex((l) => /^## \[Unreleased\]/i.test(l));

  if (unreleasedIdx === -1) {
    return createUnreleasedBlock(content, impliedLevel, sectionHeading, entry);
  }

  const currentLevel = /^## \[Unreleased\](?:\s*-\s*(patch|minor|major))?/i.exec(
    lines[unreleasedIdx],
  )?.[1] as Level | undefined;
  lines[unreleasedIdx] = `## [Unreleased] - ${resolvedLevel(currentLevel, impliedLevel)}`;

  const end = blockEnd(lines, unreleasedIdx);

  for (let i = unreleasedIdx + 1; i < end; i++) {
    if (lines[i] === sectionHeading) {
      lines.splice(i + 1, 0, entry);
      return lines.join('\n');
    }
  }

  insertSectionInOrder(lines, section, sectionHeading, entry, unreleasedIdx + 1, end);
  return lines.join('\n');
}

/** Compute the next release from CHANGELOG content. Throws ChangelogError on invalid state. */
export function computeRelease(content: string): { newVersion: string; updatedContent: string } {
  const lines = content.split('\n');

  const unreleasedIdx = lines.findIndex((l) => /^## \[Unreleased\]/i.test(l));
  if (unreleasedIdx === -1) {
    throw new ChangelogError('No [Unreleased] section found.\n  Run: fchange <type> "<message>"');
  }

  const levelMatch = /^## \[Unreleased\]\s*-\s*(patch|minor|major)/i.exec(lines[unreleasedIdx]);
  if (!levelMatch) {
    throw new ChangelogError('[Unreleased] has no bump level.\n  Run: fchange <type> "<message>"');
  }
  const level = levelMatch[1] as Level;

  // Confirm there are actual entries
  let hasEntries = false;
  for (let i = unreleasedIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break;
    if (lines[i].startsWith('- ')) {
      hasEntries = true;
      break;
    }
  }
  if (!hasEntries) {
    throw new ChangelogError('[Unreleased] has no entries.\n  Run: fchange <type> "<message>"');
  }

  let currentVersion = '0.0.0';
  for (const line of lines) {
    const match = /^## \[(\d+\.\d+\.\d+)\]/.exec(line);
    if (match) {
      currentVersion = match[1];
      break;
    }
  }

  const newVersion = bumpVersion(currentVersion, level);
  const date = new Date().toISOString().slice(0, 10);
  const updatedContent = content.replace(
    /^## \[Unreleased\](?:\s*-\s*(?:patch|minor|major))?/im,
    `## [${newVersion}] - ${date}`,
  );

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

export function prependEntry(changelogPath: string, section: SectionType, message: string): void {
  const content = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, 'utf8')
    : '# Changelog\n';
  fs.writeFileSync(changelogPath, prependEntryToContent(content, section, message), 'utf8');
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
