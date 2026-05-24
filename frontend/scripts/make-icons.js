// Generates minimal solid-color PNG icons for PWA manifest.
// Avoids adding an image dependency by writing the PNG byte-for-byte.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function crc32 (buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1)
    table[n] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk (type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

function makePng (size, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihd = Buffer.alloc(13)
  ihd.writeUInt32BE(size, 0); ihd.writeUInt32BE(size, 4)
  ihd[8] = 8; ihd[9] = 2; ihd[10] = 0; ihd[11] = 0; ihd[12] = 0
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(size).fill(rgb).flat())])
  const raw = Buffer.concat(Array(size).fill(row))
  const dat = zlib.deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihd), chunk('IDAT', dat), chunk('IEND', Buffer.alloc(0))])
}

const out = path.resolve(__dirname, '..', 'public')
fs.writeFileSync(path.join(out, 'icon-192.png'), makePng(192, [14, 165, 233]))
fs.writeFileSync(path.join(out, 'icon-512.png'), makePng(512, [14, 165, 233]))
console.log('Wrote icon-192.png + icon-512.png to', out)
