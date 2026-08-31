#!/usr/bin/env node
'use strict';

const { createLauncherBackend } = require('./index');

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'doctor';
  const backend = createLauncherBackend();
  let output;
  if (command === 'doctor') output = await backend.diagnostics.doctor({ network: !argv.includes('--offline') });
  else if (command === 'status') output = backend.status();
  else if (command === 'versions') output = await backend.versions.list({ types: ['release'], limit: Number(argv[1]) || 20 });
  else if (command === 'instances') output = backend.instances.list();
  else if (command === 'storage') output = backend.diagnostics.storage();
  else if (command === 'search') {
    const provider = argv[1] || 'modrinth';
    output = await backend.providers.search(provider, { query: argv.slice(2).join(' '), limit: 10 });
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.code || 'ERROR'}: ${error.message}\n`);
  process.exitCode = 1;
});
