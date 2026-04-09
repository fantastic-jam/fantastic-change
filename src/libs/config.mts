import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as v from 'valibot';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Function form of commitFormat, only supported in fchange.mjs / fchange.js. */
export type CommitFormatter = (type: string, pkg: string | null, message: string) => string;

export interface FConfig {
  folders?: string[];
  /**
   * Commit subject template (string) or a custom formatter function.
   * Tokens: {type}, {pkg}, {message}. ({pkg}) collapses when pkg is null.
   * Function form only available in fchange.mjs / fchange.js.
   * Default: "{type}({pkg}): {message}"
   */
  commitFormat?: string | CommitFormatter;
  /** Allowed commit types. Default: see DEFAULT_TYPES */
  types?: string[];
  /** Additional glob patterns that bypass commit message validation (e.g. "v*.*.*", "Release *"). */
  bypassPatterns?: string[];
}

export const DEFAULT_COMMIT_FORMAT = '{type}({pkg}): {message}';
export const DEFAULT_TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'ci'];

// ── Validation ────────────────────────────────────────────────────────────────

/** Schema for JSON-based config files (commitFormat must be a string). */
export const FConfigSchema = v.object({
  commitFormat: v.optional(v.string()),
  folders: v.optional(v.array(v.string())),
  types: v.optional(v.array(v.string())),
  bypassPatterns: v.optional(v.array(v.string())),
});

/** Parse and validate a JSON config (commitFormat string only). */
function parseJsonConfig(value: unknown): FConfig | null {
  const result = v.safeParse(FConfigSchema, value);
  return result.success ? result.output : null;
}

/** Parse a .mjs config — like JSON but commitFormat may be a function. */
function isStringArray(arr: unknown): arr is string[] {
  return Array.isArray(arr) && arr.every((x) => typeof x === 'string');
}

function parseMjsConfig(value: unknown): FConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const config: FConfig = {};

  if (obj.commitFormat !== undefined) {
    if (typeof obj.commitFormat !== 'string' && typeof obj.commitFormat !== 'function') return null;
    config.commitFormat = obj.commitFormat as string | CommitFormatter;
  }
  if (obj.folders !== undefined) {
    if (!isStringArray(obj.folders)) return null;
    config.folders = obj.folders;
  }
  if (obj.types !== undefined) {
    if (!isStringArray(obj.types)) return null;
    config.types = obj.types;
  }
  if (obj.bypassPatterns !== undefined) {
    if (!isStringArray(obj.bypassPatterns)) return null;
    config.bypassPatterns = obj.bypassPatterns;
  }
  return config;
}

// ── Loader interface ──────────────────────────────────────────────────────────

export interface ConfigLoader {
  /** Return a config if found in `dir`, null to pass to the next loader. */
  load(dir: string): FConfig | null | Promise<FConfig | null>;
}

// ── Loader implementations ────────────────────────────────────────────────────

/** Loads fchange.mjs or fchange.js (ESM default export). */
export class FChangeMjsLoader implements ConfigLoader {
  async load(dir: string): Promise<FConfig | null> {
    for (const name of ['fchange.mjs', 'fchange.js']) {
      const p = path.join(dir, name);
      if (!fs.existsSync(p)) continue;
      try {
        const mod = (await import(pathToFileURL(p).href)) as { default?: unknown };
        return parseMjsConfig(mod.default);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Loads fchange.json. */
export class FChangeJsonLoader implements ConfigLoader {
  load(dir: string): FConfig | null {
    const p = path.join(dir, 'fchange.json');
    if (!fs.existsSync(p)) return null;
    try {
      return parseJsonConfig(JSON.parse(fs.readFileSync(p, 'utf8')));
    } catch {
      return null;
    }
  }
}

/** Loads .fchangerc (JSON). */
export class FChangeRcLoader implements ConfigLoader {
  load(dir: string): FConfig | null {
    const p = path.join(dir, '.fchangerc');
    if (!fs.existsSync(p)) return null;
    try {
      return parseJsonConfig(JSON.parse(fs.readFileSync(p, 'utf8')));
    } catch {
      return null;
    }
  }
}

/** Reads the "fchange" key from package.json. */
export class PackageJsonLoader implements ConfigLoader {
  load(dir: string): FConfig | null {
    const p = path.join(dir, 'package.json');
    if (!fs.existsSync(p)) return null;
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
      return parseJsonConfig(pkg.fchange);
    } catch {
      return null;
    }
  }
}

export const DEFAULT_LOADERS: ConfigLoader[] = [
  new FChangeMjsLoader(),
  new FChangeJsonLoader(),
  new FChangeRcLoader(),
  new PackageJsonLoader(),
];

// ── Discovery ─────────────────────────────────────────────────────────────────

/**
 * Try all loaders in `dir`. Returns the config if any loader matches, null otherwise.
 * Does not walk up — call `findRootAndConfig` for that.
 */
export async function loadConfig(
  dir: string,
  loaders: ConfigLoader[] = DEFAULT_LOADERS,
): Promise<FConfig | null> {
  for (const loader of loaders) {
    const config = await loader.load(dir);
    if (config !== null) return config;
  }
  return null;
}

/**
 * Walk up from `dir` trying loaders at each level.
 * Returns the first directory where a config is found, or null if none is found.
 */
export async function findRootAndConfig(
  dir: string,
  loaders: ConfigLoader[] = DEFAULT_LOADERS,
): Promise<{ root: string; config: FConfig } | null> {
  let current = dir;
  while (true) {
    const config = await loadConfig(current, loaders);
    if (config !== null) return { root: current, config };
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return null;
}
