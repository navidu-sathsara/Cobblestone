'use strict';

const net = require('node:net');
const dns = require('node:dns/promises');

const DEFAULT_PORT = 25565;

function encodeVarInt(value) {
  const bytes = [];
  let current = value;
  do {
    let byte = current & 0x7f;
    current >>>= 7;
    if (current) byte |= 0x80;
    bytes.push(byte);
  } while (current);
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let value = 0;
  let size = 0;
  let byte;
  do {
    if (offset + size >= buffer.length) return null;
    byte = buffer[offset + size];
    value |= (byte & 0x7f) << (7 * size);
    size += 1;
    if (size > 5) throw new Error('Invalid VarInt');
  } while (byte & 0x80);
  return { value, size };
}

function packet(id, ...chunks) {
  const body = Buffer.concat([encodeVarInt(id), ...chunks]);
  return Buffer.concat([encodeVarInt(body.length), body]);
}

function minecraftString(value) {
  const data = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeVarInt(data.length), data]);
}

function parseAddress(value) {
  const input = String(value || '').trim();
  if (input.startsWith('[')) {
    const match = input.match(/^\[([^\]]+)](?::(\d{1,5}))?$/);
    return match ? { host: match[1], port: match[2] ? Number(match[2]) : null } : null;
  }
  const match = input.match(/^([^:\s]+)(?::(\d{1,5}))?$/);
  if (!match) return null;
  const port = match[2] ? Number(match[2]) : null;
  return port && port > 65535 ? null : { host: match[1], port };
}

function flattenDescription(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenDescription).join('');
  return `${value?.text || ''}${(value?.extra || []).map(flattenDescription).join('')}`;
}

class ServerService {
  async ping(address, { timeoutMs = 6000 } = {}) {
    const parsed = parseAddress(address);
    if (!parsed) return { online: false, error: 'invalid-address' };
    let { host, port } = parsed;
    if (!port) {
      try {
        const records = await dns.resolveSrv(`_minecraft._tcp.${host}`);
        const record = records.sort((a, b) => a.priority - b.priority)[0];
        if (record) ({ name: host, port } = record);
      } catch { port = DEFAULT_PORT; }
    }
    port ||= DEFAULT_PORT;
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      let buffer = Buffer.alloc(0);
      let startedAt = 0;
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ address, resolvedAddress: `${host}:${port}`, ...result });
      };
      socket.setTimeout(timeoutMs);
      socket.once('timeout', () => done({ online: false, error: 'timeout' }));
      socket.once('error', (error) => done({ online: false, error: error.code || 'network-error' }));
      socket.once('connect', () => {
        startedAt = Date.now();
        socket.write(Buffer.concat([
          packet(0, encodeVarInt(-1), minecraftString(parsed.host), Buffer.from([(port >> 8) & 0xff, port & 0xff]), encodeVarInt(1)),
          packet(0),
        ]));
      });
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        try {
          const length = readVarInt(buffer);
          if (!length || buffer.length < length.size + length.value) return;
          let offset = length.size;
          const id = readVarInt(buffer, offset); offset += id.size;
          const stringLength = readVarInt(buffer, offset); offset += stringLength.size;
          const value = JSON.parse(buffer.subarray(offset, offset + stringLength.value).toString('utf8'));
          done({
            online: true,
            latencyMs: Date.now() - startedAt,
            description: flattenDescription(value.description).replace(/§[0-9a-fk-or]/gi, '').trim(),
            players: { online: value.players?.online || 0, max: value.players?.max || 0, sample: value.players?.sample || [] },
            version: value.version || null,
            favicon: typeof value.favicon === 'string' && value.favicon.startsWith('data:image/') ? value.favicon : null,
            enforcesSecureChat: value.enforcesSecureChat ?? null,
          });
        } catch { done({ online: false, error: 'invalid-response' }); }
      });
    });
  }
}

module.exports = { ServerService, parseAddress, readVarInt, encodeVarInt, flattenDescription };
