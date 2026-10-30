import { crc32, deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(buf: Buffer): boolean {
  return buf.byteLength >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

export function isIco(buf: Buffer): boolean {
  return buf.byteLength >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function encodeRgbaPng(width: number, height: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decodes the classic DIB payload of an ICO entry (1/4/8/24/32 bpp, bottom-up, AND mask). */
function decodeBmpEntry(entry: Buffer): Buffer | null {
  if (entry.byteLength < 40) return null;
  const headerSize = entry.readUInt32LE(0);
  const width = entry.readInt32LE(4);
  const height = Math.abs(entry.readInt32LE(8)) / 2; // XOR image + AND mask
  const bpp = entry.readUInt16LE(14);
  const compression = entry.readUInt32LE(16);
  if (
    headerSize < 40 ||
    compression !== 0 ||
    width < 1 ||
    width > 256 ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > 256 ||
    ![1, 4, 8, 24, 32].includes(bpp)
  )
    return null;
  const paletteSize = bpp <= 8 ? entry.readUInt32LE(32) || 1 << bpp : 0;
  const paletteStart = headerSize;
  const xorStart = paletteStart + paletteSize * 4;
  const xorStride = Math.ceil((width * bpp) / 32) * 4;
  const andStart = xorStart + xorStride * height;
  const andStride = Math.ceil(width / 32) * 4;
  if (entry.byteLength < andStart) return null;
  const hasMask = entry.byteLength >= andStart + andStride * height;
  const rgba = Buffer.alloc(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y++) {
    const row = xorStart + (height - 1 - y) * xorStride;
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      let b: number,
        g: number,
        r: number,
        a = 255;
      if (bpp === 32 || bpp === 24) {
        const at = row + x * (bpp / 8);
        b = entry[at]!;
        g = entry[at + 1]!;
        r = entry[at + 2]!;
        if (bpp === 32) {
          a = entry[at + 3]!;
          if (a) anyAlpha = true;
        }
      } else {
        const bit = x * bpp;
        const shift = 8 - bpp - (bit % 8);
        const index = (entry[row + (bit >> 3)]! >> shift) & ((1 << bpp) - 1);
        const color = paletteStart + index * 4;
        if (index >= paletteSize || color + 3 > entry.byteLength) return null;
        b = entry[color]!;
        g = entry[color + 1]!;
        r = entry[color + 2]!;
      }
      rgba[out] = r;
      rgba[out + 1] = g;
      rgba[out + 2] = b;
      rgba[out + 3] = a;
    }
  }
  // 32 bpp icons carry their own alpha; older depths (or all-zero alpha) use the AND mask.
  if (bpp !== 32 || !anyAlpha) {
    for (let y = 0; y < height; y++) {
      const row = andStart + (height - 1 - y) * andStride;
      for (let x = 0; x < width; x++) {
        const transparent = hasMask && (entry[row + (x >> 3)]! >> (7 - (x % 8))) & 1;
        rgba[(y * width + x) * 4 + 3] = transparent ? 0 : 255;
      }
    }
  }
  return encodeRgbaPng(width, height, rgba);
}

/** Returns the best-fitting ICO image as PNG bytes, or null for malformed/unsupported files. */
export function icoToPng(buf: Buffer): Buffer | null {
  if (!isIco(buf)) return null;
  const count = buf.readUInt16LE(4);
  if (count < 1 || buf.byteLength < 6 + count * 16) return null;
  const entries = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const size = buf.readUInt32LE(at + 8);
    const offset = buf.readUInt32LE(at + 12);
    if (offset + size > buf.byteLength || size === 0) continue;
    entries.push({
      width: buf[at] || 256,
      bpp: buf.readUInt16LE(at + 6),
      data: buf.subarray(offset, offset + size),
    });
  }
  // Cards render at 128 px: prefer the largest entry up to that, then the smallest above it.
  const fit = (width: number) => (width <= 128 ? 1000 + width : 1000 - width);
  entries.sort((a, b) => fit(b.width) - fit(a.width) || b.bpp - a.bpp);
  for (const entry of entries) {
    if (isPng(entry.data)) return Buffer.from(entry.data);
    const png = decodeBmpEntry(entry.data);
    if (png) return png;
  }
  return null;
}
