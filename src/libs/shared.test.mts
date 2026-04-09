import { describe, expect, it } from 'vitest';
import { countPositionals, isPkgFlag, renderCommitFormat } from './shared.mts';

describe('renderCommitFormat', () => {
  it('renders with pkg', () => {
    expect(renderCommitFormat('{type}({pkg}): {message}', 'feat', 'web', 'add thing')).toBe(
      'feat(web): add thing',
    );
  });

  it('collapses ({pkg}) when pkg is null', () => {
    expect(renderCommitFormat('{type}({pkg}): {message}', 'feat', null, 'add thing')).toBe(
      'feat: add thing',
    );
  });

  it('leaves bare {pkg} empty when null', () => {
    expect(renderCommitFormat('{type}/{pkg}: {message}', 'fix', null, 'patch')).toBe('fix/: patch');
  });

  it('supports custom format without pkg', () => {
    expect(renderCommitFormat('[{type}] {message}', 'chore', null, 'update deps')).toBe(
      '[chore] update deps',
    );
  });

  it('calls a function formatter with type, pkg, message', () => {
    const fmt = (type: string, pkg: string | null, msg: string) =>
      pkg ? `${type}(${pkg}): ${msg}` : `${type}: ${msg}`;
    expect(renderCommitFormat(fmt, 'feat', 'web', 'add search')).toBe('feat(web): add search');
    expect(renderCommitFormat(fmt, 'fix', null, 'patch')).toBe('fix: patch');
  });
});

describe('isPkgFlag', () => {
  it('matches --pkg', () => expect(isPkgFlag('--pkg')).toBe(true));
  it('matches -p', () => expect(isPkgFlag('-p')).toBe(true));
  it('does not match other flags', () => expect(isPkgFlag('--dry-run')).toBe(false));
  it('does not match positionals', () => expect(isPkgFlag('feat')).toBe(false));
});

describe('countPositionals', () => {
  it('counts positionals only', () => {
    expect(countPositionals(['feat', 'my message'], 2)).toBe(2);
  });

  it('skips --pkg and its value', () => {
    expect(countPositionals(['--pkg', 'web', 'feat'], 3)).toBe(1);
  });

  it('skips other flags', () => {
    expect(countPositionals(['--dry-run', 'feat'], 2)).toBe(1);
  });

  it('stops at endIdx', () => {
    expect(countPositionals(['feat', 'message', 'extra'], 2)).toBe(2);
  });
});
