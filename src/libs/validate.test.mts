import { describe, expect, it } from 'vitest';
import { DEFAULT_TYPES } from './config.mts';
import { validateCommitMessage } from './validate.mts';

describe('validateCommitMessage', () => {
  it('accepts a valid message', () => {
    expect(validateCommitMessage('feat: add login page', DEFAULT_TYPES)).toBeNull();
  });

  it('accepts a message with scope', () => {
    expect(validateCommitMessage('fix(auth): resolve token expiry', DEFAULT_TYPES)).toBeNull();
  });

  it('accepts breaking change marker without scope', () => {
    expect(validateCommitMessage('feat!: drop Node 18', DEFAULT_TYPES)).toBeNull();
  });

  it('accepts breaking change marker with scope', () => {
    expect(validateCommitMessage('feat(api)!: remove v1 endpoints', DEFAULT_TYPES)).toBeNull();
  });

  it('accepts custom types', () => {
    expect(validateCommitMessage('new: something', ['new', 'fix'])).toBeNull();
  });

  it('rejects an unknown type', () => {
    expect(validateCommitMessage('blah: something', DEFAULT_TYPES)).not.toBeNull();
  });

  it('rejects missing message body', () => {
    expect(validateCommitMessage('feat: ', DEFAULT_TYPES)).not.toBeNull();
  });

  it('rejects missing colon separator', () => {
    expect(validateCommitMessage('feat add thing', DEFAULT_TYPES)).not.toBeNull();
  });

  it('skips Merge commits', () => {
    expect(validateCommitMessage('Merge branch "main" into feat', DEFAULT_TYPES)).toBeNull();
  });

  it('skips Revert commits', () => {
    expect(validateCommitMessage('Revert "feat: add thing"', DEFAULT_TYPES)).toBeNull();
  });

  it('skips fixup commits', () => {
    expect(validateCommitMessage('fixup! feat: add thing', DEFAULT_TYPES)).toBeNull();
  });

  it('skips squash commits', () => {
    expect(validateCommitMessage('squash! fix: resolve issue', DEFAULT_TYPES)).toBeNull();
  });

  it('includes valid types in the error message', () => {
    const error = validateCommitMessage('bad: message', ['feat', 'fix']);
    expect(error).toContain('feat, fix');
  });

  it('includes [!] in the expected format hint', () => {
    const error = validateCommitMessage('bad: message', ['feat']);
    expect(error).toContain('[!]');
  });
});

describe('validateCommitMessage — bypassPatterns', () => {
  it('bypasses when subject matches a glob pattern', () => {
    expect(validateCommitMessage('v1.2.3', DEFAULT_TYPES, ['v*.*.*'])).toBeNull();
  });

  it('bypasses case-insensitively', () => {
    expect(validateCommitMessage('Release 1.2.3', DEFAULT_TYPES, ['Release *'])).toBeNull();
    expect(validateCommitMessage('release 1.2.3', DEFAULT_TYPES, ['Release *'])).toBeNull();
  });

  it('does not bypass when pattern does not match', () => {
    expect(validateCommitMessage('v1.2.3', DEFAULT_TYPES, ['Release *'])).not.toBeNull();
  });

  it('bypasses when any pattern in the list matches', () => {
    expect(validateCommitMessage('v1.2.3', DEFAULT_TYPES, ['Release *', 'v*.*.*'])).toBeNull();
  });

  it('still validates when bypassPatterns is empty', () => {
    expect(validateCommitMessage('bad message', DEFAULT_TYPES, [])).not.toBeNull();
  });
});

describe('validateCommitMessage — validScopes', () => {
  const scopes = ['web', 'api'];

  it('accepts a valid scope', () => {
    expect(validateCommitMessage('feat(web): add search', DEFAULT_TYPES, [], scopes)).toBeNull();
  });

  it('rejects an unknown scope', () => {
    expect(
      validateCommitMessage('feat(cli): add search', DEFAULT_TYPES, [], scopes),
    ).not.toBeNull();
  });

  it('includes valid scopes in the error message', () => {
    const error = validateCommitMessage('feat(cli): add search', DEFAULT_TYPES, [], scopes);
    expect(error).toContain('web, api');
  });

  it('allows no scope when validScopes is set', () => {
    expect(validateCommitMessage('feat: add search', DEFAULT_TYPES, [], scopes)).toBeNull();
  });

  it('does not validate scopes when validScopes is null', () => {
    expect(validateCommitMessage('feat(anything): add search', DEFAULT_TYPES, [], null)).toBeNull();
  });
});
