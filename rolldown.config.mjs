import { readFileSync } from 'node:fs';
import { defineConfig } from 'rolldown';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));
const banner = `#!/usr/bin/env node\nconst __VERSION__ = ${JSON.stringify(version)};`;

export default defineConfig([
  {
    input: 'src/fchange/fchange.mts',
    platform: 'node',
    output: { file: '.bin/fchange', format: 'esm', banner },
  },
  {
    input: 'src/fcommit/fcommit.mts',
    platform: 'node',
    output: { file: '.bin/fcommit', format: 'esm', banner },
  },
  {
    input: 'src/frelease/frelease.mts',
    platform: 'node',
    output: { file: '.bin/frelease', format: 'esm', banner },
  },
]);
