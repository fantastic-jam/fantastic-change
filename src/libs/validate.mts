import pm from 'picomatch';

// These are always bypassed regardless of config.
const HARDCODED_BYPASS = /^(Merge|Revert|fixup!|squash!) /i;

/**
 * Validate a commit message subject against a list of allowed types.
 * Returns null if valid, or an error string if invalid.
 *
 * Merge, Revert, fixup!, and squash! commits are always bypassed.
 * Additional patterns in `bypassPatterns` are matched with picomatch globs.
 */
export function validateCommitMessage(
  subject: string,
  types: string[],
  bypassPatterns: string[] = [],
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
  return null;
}
