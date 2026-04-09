import { describe, expect, it } from 'vitest';
import {
  bumpVersion,
  ChangelogError,
  computeRelease,
  extractVersionChangelog,
  prependEntryToContent,
} from './changelog.mts';

describe('bumpVersion', () => {
  it('bumps patch', () => expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4'));
  it('bumps minor and resets patch', () => expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0'));
  it('bumps major and resets minor+patch', () =>
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0'));
  it('starts from 0.0.0 patch', () => expect(bumpVersion('0.0.0', 'patch')).toBe('0.0.1'));
  it('starts from 0.0.0 minor', () => expect(bumpVersion('0.0.0', 'minor')).toBe('0.1.0'));
  it('starts from 0.0.0 major', () => expect(bumpVersion('0.0.0', 'major')).toBe('1.0.0'));
});

describe('prependEntryToContent', () => {
  it('inserts entry after existing [Unreleased] heading', () => {
    const input = '# Changelog\n\n## [Unreleased]\n## [1.0.0] - 2024-01-01\n';
    const result = prependEntryToContent(input, 'patch', 'fix typo');
    expect(result).toContain('## [Unreleased]\n- patch: fix typo\n');
  });

  it('prepends to existing entries under [Unreleased]', () => {
    const input = '# Changelog\n\n## [Unreleased]\n- patch: old fix\n';
    const result = prependEntryToContent(input, 'minor', 'new feature');
    expect(result).toContain('## [Unreleased]\n- minor: new feature\n- patch: old fix\n');
  });

  it('creates [Unreleased] section when missing, after title', () => {
    const input = '# Changelog\n## [1.0.0] - 2024-01-01\n';
    const result = prependEntryToContent(input, 'minor', 'new feature');
    expect(result).toContain('## [Unreleased]\n- minor: new feature\n');
    expect(result.indexOf('## [Unreleased]')).toBeLessThan(result.indexOf('## [1.0.0]'));
  });

  it('creates [Unreleased] section in empty changelog', () => {
    const result = prependEntryToContent('# Changelog\n', 'patch', 'init');
    expect(result).toContain('## [Unreleased]\n- patch: init\n');
  });
});

describe('computeRelease', () => {
  it('uses patch level when all entries are patch', () => {
    const content = '# Changelog\n\n## [Unreleased]\n- patch: fix bug\n\n## [1.0.0] - 2024-01-01\n';
    expect(computeRelease(content).newVersion).toBe('1.0.1');
  });

  it('uses highest level — minor wins over patch', () => {
    const content =
      '# Changelog\n\n## [Unreleased]\n- patch: fix\n- minor: feat\n\n## [1.0.0] - 2024-01-01\n';
    expect(computeRelease(content).newVersion).toBe('1.1.0');
  });

  it('uses highest level — major wins over all', () => {
    const content =
      '# Changelog\n\n## [Unreleased]\n- minor: feat\n- major: breaking\n\n## [1.0.0] - 2024-01-01\n';
    expect(computeRelease(content).newVersion).toBe('2.0.0');
  });

  it('starts from 0.0.0 when no previous version exists', () => {
    const content = '# Changelog\n\n## [Unreleased]\n- minor: first release\n';
    expect(computeRelease(content).newVersion).toBe('0.1.0');
  });

  it('replaces [Unreleased] heading with versioned heading', () => {
    const content = '# Changelog\n\n## [Unreleased]\n- patch: fix\n\n## [1.0.0] - 2024-01-01\n';
    const { updatedContent } = computeRelease(content);
    expect(updatedContent).not.toContain('## [Unreleased]');
    expect(updatedContent).toMatch(/## \[1\.0\.1\] - \d{4}-\d{2}-\d{2}/);
  });

  it('throws ChangelogError when [Unreleased] section is missing', () => {
    expect(() => computeRelease('# Changelog\n## [1.0.0] - 2024-01-01\n')).toThrow(ChangelogError);
  });

  it('throws ChangelogError when [Unreleased] section has no entries', () => {
    expect(() =>
      computeRelease('# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2024-01-01\n'),
    ).toThrow(ChangelogError);
  });

  it('ignores non-entry lines under [Unreleased]', () => {
    const content =
      '# Changelog\n\n## [Unreleased]\n\nSome note.\n- patch: real entry\n\n## [1.0.0]\n';
    expect(computeRelease(content).newVersion).toBe('1.0.1');
  });
});

describe('extractVersionChangelog', () => {
  const content = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '- patch: wip',
    '',
    '## [1.2.0] - 2024-06-01',
    '- minor: add search',
    '- patch: fix typo',
    '',
    '## [1.1.0] - 2024-05-01',
    '- minor: add login',
    '',
  ].join('\n');

  it('returns the latest released version when no version given', () => {
    const result = extractVersionChangelog(content);
    expect(result?.version).toBe('1.2.0');
    expect(result?.notes).toBe('- minor: add search\n- patch: fix typo');
  });

  it('returns notes for a specific version', () => {
    const result = extractVersionChangelog(content, '1.1.0');
    expect(result?.version).toBe('1.1.0');
    expect(result?.notes).toBe('- minor: add login');
  });

  it('skips [Unreleased] when finding latest', () => {
    const result = extractVersionChangelog(content);
    expect(result?.version).not.toBe('Unreleased');
  });

  it('returns null when version not found', () => {
    expect(extractVersionChangelog(content, '9.9.9')).toBeNull();
  });

  it('returns null when no versioned sections exist', () => {
    expect(extractVersionChangelog('# Changelog\n\n## [Unreleased]\n- patch: wip\n')).toBeNull();
  });

  it('trims trailing blank lines from notes', () => {
    const c = '# Changelog\n\n## [1.0.0] - 2024-01-01\n- patch: fix\n\n';
    expect(extractVersionChangelog(c)?.notes).toBe('- patch: fix');
  });
});
