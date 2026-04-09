import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FChangeJsonLoader,
  FChangeRcLoader,
  findRootAndConfig,
  loadConfig,
  PackageJsonLoader,
} from './config.mts';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fchange-test-'));
}

describe('FChangeRcLoader', () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('returns null when .fchangerc is missing', () => {
    expect(new FChangeRcLoader().load(dir)).toBeNull();
  });

  it('returns config from .fchangerc', () => {
    fs.writeFileSync(path.join(dir, '.fchangerc'), JSON.stringify({ types: ['a', 'b'] }));
    expect(new FChangeRcLoader().load(dir)).toEqual({ types: ['a', 'b'] });
  });

  it('returns null on invalid JSON', () => {
    fs.writeFileSync(path.join(dir, '.fchangerc'), 'not json');
    expect(new FChangeRcLoader().load(dir)).toBeNull();
  });
});

describe('FChangeJsonLoader', () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('returns null when fchange.json is missing', () => {
    expect(new FChangeJsonLoader().load(dir)).toBeNull();
  });

  it('returns config from fchange.json', () => {
    fs.writeFileSync(
      path.join(dir, 'fchange.json'),
      JSON.stringify({ commitFormat: '{type}: {message}' }),
    );
    expect(new FChangeJsonLoader().load(dir)).toEqual({ commitFormat: '{type}: {message}' });
  });
});

describe('PackageJsonLoader', () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('returns null when package.json has no fchange key', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'test' }));
    expect(new PackageJsonLoader().load(dir)).toBeNull();
  });

  it('returns the fchange key from package.json', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test', fchange: { types: ['feat', 'fix'] } }),
    );
    expect(new PackageJsonLoader().load(dir)).toEqual({ types: ['feat', 'fix'] });
  });

  it('returns null when package.json is missing', () => {
    expect(new PackageJsonLoader().load(dir)).toBeNull();
  });
});

describe('loadConfig', () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true });
  });

  it('returns null when no loader matches', async () => {
    expect(await loadConfig(dir, [new FChangeRcLoader()])).toBeNull();
  });

  it('returns first matching loader result', async () => {
    fs.writeFileSync(path.join(dir, '.fchangerc'), JSON.stringify({ types: ['feat'] }));
    fs.writeFileSync(path.join(dir, 'fchange.json'), JSON.stringify({ types: ['fix'] }));
    // FChangeJsonLoader comes before FChangeRcLoader in this custom order
    const result = await loadConfig(dir, [new FChangeJsonLoader(), new FChangeRcLoader()]);
    expect(result).toEqual({ types: ['fix'] });
  });
});

describe('findRootAndConfig', () => {
  let root: string;
  beforeEach(() => {
    root = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true });
  });

  it('finds config in the current directory', async () => {
    fs.writeFileSync(path.join(root, '.fchangerc'), JSON.stringify({ types: ['feat'] }));
    const result = await findRootAndConfig(root, [new FChangeRcLoader()]);
    expect(result?.root).toBe(root);
    expect(result?.config).toEqual({ types: ['feat'] });
  });

  it('walks up to find config in a parent directory', async () => {
    fs.writeFileSync(path.join(root, '.fchangerc'), JSON.stringify({ types: ['fix'] }));
    const child = path.join(root, 'packages', 'app');
    fs.mkdirSync(child, { recursive: true });
    const result = await findRootAndConfig(child, [new FChangeRcLoader()]);
    expect(result?.root).toBe(root);
    expect(result?.config).toEqual({ types: ['fix'] });
  });

  it('returns null when nothing is found anywhere', async () => {
    const result = await findRootAndConfig(root, [new FChangeRcLoader()]);
    expect(result).toBeNull();
  });
});
