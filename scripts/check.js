'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function files(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : entry.name.endsWith('.js') ? [full] : [];
  });
}

// The renderer is JSX and is type/syntax checked by its own Vite build instead.
const directories = ['backend', 'test', 'electron', 'scripts'];
const targets = directories.flatMap((directory) => files(path.join(process.cwd(), directory)));
for (const target of targets) {
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}
process.stdout.write(`Syntax checked ${targets.length} JavaScript files.\n`);
