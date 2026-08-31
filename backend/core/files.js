'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function replaceFileSync(source, target) {
  try {
    fs.renameSync(source, target);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
    fs.rmSync(target, { force: true });
    fs.renameSync(source, target);
  }
}

function writeFileAtomicSync(target, data, options = undefined) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, data, options);
    replaceFileSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

async function writeFileAtomic(target, data, options = undefined) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(5).toString('hex')}.tmp`;
  try {
    await fsp.writeFile(temporary, data, options);
    try {
      await fsp.rename(temporary, target);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      await fsp.rm(target, { force: true });
      await fsp.rename(temporary, target);
    }
  } finally {
    await fsp.rm(temporary, { force: true });
  }
}

async function hashFile(filePath, algorithms = ['sha256']) {
  const hashers = new Map(algorithms.map((algorithm) => [algorithm, crypto.createHash(algorithm)]));
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    for (const hasher of hashers.values()) hasher.update(chunk);
  }
  return Object.fromEntries([...hashers].map(([algorithm, hasher]) => [algorithm, hasher.digest('hex')]));
}

function directorySize(directory) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) total += directorySize(fullPath);
      else if (entry.isFile()) total += fs.statSync(fullPath).size;
    }
  } catch {
    return total;
  }
  return total;
}

module.exports = { writeFileAtomic, writeFileAtomicSync, replaceFileSync, hashFile, directorySize };
