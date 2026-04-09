import pm from 'picomatch';

// These are always bypassed regardless of config.
const HARDCODED_BYPASS = /^(Merge|Revert|fixup!|squash!) /i;

/**
 * Validate a commit message subject against allowed types and optional scopes.
 * Returns null if valid, or an error string if invalid.
 *
 * Merge, Revert, fixup!, and squash! commits are always bypassed.
 * Additional patterns in `bypassPatterns` are matched with picomatch globs.
 *
 * Scope validation is only active when `validScopes` is non-null.
 * When active, a parenthetical scope must be one of the allowed values.
 */
export function validateCommitMessage(
  subject: string,
  types: string[],
  bypassPatterns: string[] = [],
  validScopes: string[] | null = null,
): string | null {
  if (HARDCODED_BYPASS.test(subject)) return null;

  if (bypassPatterns.length > 0 && pm(bypassPatterns, { nocase: true })(subject)) return null;

  const typePattern = types.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`^(${typePattern})(\\([^)]+\\))?:\\s+\\S`);

  if (!re.test(subject)) {
    return [
      'Commit message does not match expected format.',
      `  Subject: ${subject}`,
      '  Expected: <type>[(scope)]: <message>',
      `  Valid types: ${types.join(', ')}`,
    ].join('\n');
  }

  if (validScopes !== null) {
    const scopeMatch = subject.match(/^\w+\(([^)]+)\):/);
    const scope = scopeMatch?.[1] ?? null;
    if (scope !== null && !validScopes.includes(scope)) {
      return [
        `Unknown scope "${scope}".`,
        `  Subject: ${subject}`,
        `  Valid scopes: ${validScopes.join(', ')}`,
      ].join('\n');
    }
  }

  return null;
}
