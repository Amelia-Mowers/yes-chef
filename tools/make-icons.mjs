// Rasterizes the chef-hat icon to PNGs (no image tooling needed).
import {writeFileSync} from 'node:fs'
import {deflateSync} from 'node:zlib'

const BG = [0xe0, 0x7a, 0x5f]
const STRIPE = [0xf5, 0xcf, 0xc5]

function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r))
  const cy = Math.max(y0 + r, Math.min(y, y1 - r))
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
const circle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r

// Colour at a point in the 512×512 design space, or null for transparent.
function shade(x, y, maskable) {
  if (maskable) {
    const s = 0.72
    x = (x - 256) / s + 256
    y = (y - 256) / s + 256
  } else if (!roundRect(x, y, 0, 0, 512, 512, 112)) return null
  const hat = circle(x, y, 168, 228, 72) || circle(x, y, 344, 228, 72) || circle(x, y, 256, 190, 86) || (x >= 168 && x <= 344 && y >= 200 && y <= 300)
  if (hat) return [255, 255, 255]
  if (roundRect(x, y, 160, 300, 352, 372, 10)) return y >= 324 && y <= 336 ? STRIPE : [255, 255, 255]
  return BG
}

function png(size, maskable) {
  const ss = 4
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = shade(((px + (sx + 0.5) / ss) / size) * 512, ((py + (sy + 0.5) / ss) / size) * 512, maskable)
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a++
          }
        }
      const o = py * (size * 4 + 1) + 1 + px * 4
      const n = ss * ss
      raw[o] = a ? r / a : 0
      raw[o + 1] = a ? g / a : 0
      raw[o + 2] = a ? b / a : 0
      raw[o + 3] = (a / n) * 255
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const table = Array.from({length: 256}, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return c ^ 0xffffffff
}

writeFileSync('icons/icon-192.png', png(192, false))
writeFileSync('icons/icon-512.png', png(512, false))
writeFileSync('icons/icon-maskable-512.png', png(512, true))
console.log('icons written')
