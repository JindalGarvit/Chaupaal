/**
 * Minimal ZIP writer (store / no compression, UTF-8 names) for data exports — no dependency.
 * JSON is small and media (JPEG/PNG/MP4/WebP) is already compressed, so "store" costs little.
 *
 *   buildZip([{ name: 'profile.json', data: Buffer|string, date?: Date }]) → Buffer
 *   readZip(buffer) → [{ name, data }]   (tests / verification only; store method only)
 */
'use strict';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const dt = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  const time = (dt.getUTCHours() << 11) | (dt.getUTCMinutes() << 5) | Math.floor(dt.getUTCSeconds() / 2);
  const date = ((Math.max(1980, dt.getUTCFullYear()) - 1980) << 9) | ((dt.getUTCMonth() + 1) << 5) | dt.getUTCDate();
  return { time, date };
}

function safeName(name) {
  return String(name || 'file')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/')
    .slice(0, 200) || 'file';
}

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const seen = new Set();
  (entries || []).forEach((e) => {
    let name = safeName(e.name);
    while (seen.has(name)) name = name.replace(/(\.[^./]*)?$/, (ext) => '_' + (ext || ''));
    seen.add(name);
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data == null ? '' : e.data), 'utf8');
    const crc = crc32(data);
    const { time, date } = dosTime(e.date);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + data.length;
  });
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(seen.size, 8);
  end.writeUInt16LE(seen.size, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

function readZip(buf) {
  const out = [];
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const start = i + 30 + nameLen + extraLen;
    const data = buf.slice(start, start + size);
    if (crc32(data) !== buf.readUInt32LE(i + 14)) throw new Error('CRC mismatch: ' + name);
    out.push({ name, data });
    i = start + size;
  }
  return out;
}

module.exports = { buildZip, readZip, crc32 };
