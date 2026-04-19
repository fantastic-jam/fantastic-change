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
  it('inserts entry under existing ### section', () => {
    const input =
      '# Changelog\n\n## [Unreleased] - patch\n\n### Fixed\n\n## [1.0.0] - 2024-01-01\n';
    const result = prependEntryToContent(input, 'Fixed', 'fix typo');
    expect(result).toContain('### Fixed\n- fix typo\n');
  });

  it('prepends to existing entries under same section', () => {
    const input = '# Changelog\n\n## [Unreleased] - patch\n\n### Fixed\n- old fix\n';
    const result = prependEntryToContent(input, 'Fixed', 'new fix');
    expect(result).toContain('### Fixed\n- new fix\n- old fix\n');
  });

  it('creates new ### section in KAC order when missing', () => {
    const input = '# Changelog\n\n## [Unreleased] - patch\n\n### Fixed\n- old fix\n';
    const result = prependEntryToContent(input, 'Added', 'new feature');
    // Added comes before Fixed in KAC order
    expect(result).toContain('### Added\n- new feature');
    expect(result.indexOf('### Added')).toBeLessThan(result.indexOf('### Fixed'));
  });

  it('appends new section after existing ones when it comes later in KAC order', () => {
    const input = '# Changelog\n\n## [Unreleased] - minor\n\n### Added\n- feature\n';
    const result = prependEntryToContent(input, 'Fixed', 'bug fix');
    expect(result).toContain('### Fixed\n- bug fix');
    expect(result.indexOf('### Added')).toBeLessThan(result.indexOf('### Fixed'));
  });

  it('creates [Unreleased] section when missing, after title', () => {
    const input = '# Changelog\n## [1.0.0] - 2024-01-01\n';
    const result = prependEntryToContent(input, 'Added', 'new feature');
    expect(result).toContain('## [Unreleased] - minor\n\n### Added\n- new feature\n');
    expect(result.indexOf('## [Unreleased]')).toBeLessThan(result.indexOf('## [1.0.0]'));
  });

  it('creates [Unreleased] section in empty changelog', () => {
    const result = prependEntryToContent('# Changelog\n', 'Fixed', 'init');
    expect(result).toContain('## [Unreleased] - patch\n\n### Fixed\n- init\n');
  });

  it('upgrades level when higher-level section is added', () => {
    const input = '# Changelog\n\n## [Unreleased] - patch\n\n### Fixed\n- bug\n';
    const result = prependEntryToContent(input, 'Added', 'feature');
    expect(result).toContain('## [Unreleased] - minor');
  });

  it('does not downgrade level when lower-level section is added', () => {
    const input = '# Changelog\n\n## [Unreleased] - major\n\n### Removed\n- thing\n';
    const result = prependEntryToContent(input, 'Fixed', 'bug');
    expect(result).toContain('## [Unreleased] - major');
  });

  it('Removed section implies major level', () => {
    const result = prependEntryToContent('# Changelog\n', 'Removed', 'old api');
    expect(result).toContain('## [Unreleased] - major');
  });
});

describe('computeRelease', () => {
  it('uses level from [Unreleased] heading — patch', () => {
    const content =
      '# Changelog\n\n## [Unreleased] - patch\n\n### Fixed\n- fix bug\n\n## [1.0.0] - 2024-01-01\n';
    expect(computeRelease(content).newVersion).toBe('1.0.1');
  });

  it('uses level from [Unreleased] heading — minor', () => {
    const content =
      '# Changelog\n\n## [Unreleased] - minor\n\n### Added\n- feat\n\n## [1.0.0] - 2024-01-01\n';
    expect(computeRelease(content).newVersion).toBe('1.1.0');
  });

  it('uses level from [Unreleased] heading — major', () => {
    const content =
      '# Changelog\n\n## [Unreleased] - major\n\n### Removed\n- breaking\n\n## [1.0.0] - 2024-01-01\n';
    expect(computeRelease(content).newVersion).toBe('2.0.0');
  });

  it('starts from 0.0.0 when no previous version exists', () => {
    const content = '# Changelog\n\n## [Unreleased] - minor\n\n### Added\n- first release\n';
    expect(computeRelease(content).newVersion).toBe('0.1.0');
  });

  it('replaces [Unreleased] heading with versioned heading', () => {
    const content =
      '# Changelog\n\n## [Unreleased] - patch\n\n### Fixed\n- fix\n\n## [1.0.0] - 2024-01-01\n';
    const { updatedContent } = computeRelease(content);
    expect(updatedContent).not.toContain('## [Unreleased]');
    expect(updatedContent).toMatch(/## \[1\.0\.1\] - \d{4}-\d{2}-\d{2}/);
  });

  it('throws ChangelogError when [Unreleased] section is missing', () => {
    expect(() => computeRelease('# Changelog\n## [1.0.0] - 2024-01-01\n')).toThrow(ChangelogError);
  });

  it('throws ChangelogError when [Unreleased] has no bump level', () => {
    expect(() => computeRelease('# Changelog\n\n## [Unreleased]\n\n### Fixed\n- fix\n')).toThrow(
      ChangelogError,
    );
  });

  it('throws ChangelogError when [Unreleased] section has no entries', () => {
    expect(() =>
      computeRelease('# Changelog\n\n## [Unreleased] - patch\n\n## [1.0.0] - 2024-01-01\n'),
    ).toThrow(ChangelogError);
  });
});

describe('extractVersionChangelog', () => {
  const content = [
    '# Changelog',
    '',
    '## [Unreleased] - patch',
    '',
    '### Fixed',
    '- wip',
    '',
    '## [1.2.0] - 2024-06-01',
    '',
    '### Added',
    '- add search',
    '',
    '### Fixed',
    '- fix typo',
    '',
    '## [1.1.0] - 2024-05-01',
    '',
    '### Added',
    '- add login',
    '',
  ].join('\n');

  it('returns the latest released version when no version given', () => {
    const result = extractVersionChangelog(content);
    expect(result?.version).toBe('1.2.0');
    expect(result?.notes).toContain('### Added');
    expect(result?.notes).toContain('- add search');
  });

  it('returns notes for a specific version', () => {
    const result = extractVersionChangelog(content, '1.1.0');
    expect(result?.version).toBe('1.1.0');
    expect(result?.notes).toContain('- add login');
  });

  it('skips [Unreleased] when finding latest', () => {
    const result = extractVersionChangelog(content);
    expect(result?.version).not.toBe('Unreleased');
  });

  it('returns null when version not found', () => {
    expect(extractVersionChangelog(content, '9.9.9')).toBeNull();
  });

  it('returns null when no versioned sections exist', () => {
    expect(
      extractVersionChangelog('# Changelog\n\n## [Unreleased] - patch\n\n### Fixed\n- wip\n'),
    ).toBeNull();
  });

  it('trims trailing blank lines from notes', () => {
    const c = '# Changelog\n\n## [1.0.0] - 2024-01-01\n\n### Fixed\n- fix\n\n';
    expect(extractVersionChangelog(c)?.notes).toBe('### Fixed\n- fix');
  });
});
