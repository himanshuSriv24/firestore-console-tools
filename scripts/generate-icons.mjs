/**
 * Generates simple PNG icons for the Chrome extension.
 * Pure Node.js — no external dependencies.
 * Produces: public/icons/icon16.png, icon48.png, icon128.png
 */

import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";

// --- CRC32 (required for PNG chunk checksums) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

/**
 * Creates a simple icon PNG with:
 * - Blue (#1a73e8) background
 * - White 2px border inset
 * - White "{ }" pixels in the center
 */
function createIconPNG(size) {
  const R = 26,
    G = 115,
    B = 232; // #1a73e8 blue
  const WR = 255,
    WG = 255,
    WB = 255; // white

  // Build pixel grid: each row = [filterByte, R,G,B, R,G,B, ...]
  const rowLen = 1 + size * 3;
  const raw = Buffer.alloc(size * rowLen, 0);

  const border = Math.max(1, Math.round(size * 0.1));

  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // PNG filter: None
    for (let x = 0; x < size; x++) {
      const i = y * rowLen + 1 + x * 3;
      const onBorder =
        x < border || x >= size - border || y < border || y >= size - border;

      if (onBorder) {
        // white border
        raw[i] = WR;
        raw[i + 1] = WG;
        raw[i + 2] = WB;
      } else {
        // blue fill
        raw[i] = R;
        raw[i + 1] = G;
        raw[i + 2] = B;
      }
    }
  }

  // Draw a simple "{ }" curly brace symbol in white for sizes >= 48
  if (size >= 48) {
    const cx = Math.floor(size / 2);
    const cy = Math.floor(size / 2);
    const h = Math.floor(size * 0.4);
    const gap = Math.floor(size * 0.08);

    for (let dy = -h; dy <= h; dy++) {
      const y = cy + dy;
      if (y < border || y >= size - border) continue;

      // Left brace "{"
      const lx = Math.abs(dy) === h || dy === 0 ? cx - gap - 2 : cx - gap - 1;
      // Right brace "}"
      const rx = Math.abs(dy) === h || dy === 0 ? cx + gap + 2 : cx + gap + 1;

      for (const x of [lx - 1, lx, rx, rx + 1]) {
        if (x < border || x >= size - border) continue;
        const i = y * rowLen + 1 + x * 3;
        raw[i] = WR;
        raw[i + 1] = WG;
        raw[i + 2] = WB;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB (no alpha)
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Generate all required icon sizes
mkdirSync("public/icons", { recursive: true });
for (const size of [16, 48, 128]) {
  const buf = createIconPNG(size);
  writeFileSync(`public/icons/icon${size}.png`, buf);
  console.log(`✓ Generated public/icons/icon${size}.png (${buf.length} bytes)`);
}
