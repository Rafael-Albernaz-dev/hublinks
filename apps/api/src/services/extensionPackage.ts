import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const distPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../extension/dist');
export const extensionPackageFiles = [
  'manifest.json',
  'background.js',
  'autofill.js',
  'content.js',
  'popup.html',
  'popup.js',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
] as const;

// ZIP Store, fixed DOS date 1980-01-01, fixed entry order, no machine-specific paths.
export async function buildExtensionZipBuffer(directory = distPath): Promise<Buffer> {
  const files = await Promise.all(
    extensionPackageFiles.map(async (name) => ({
      name: Buffer.from(name),
      data: await readFile(resolve(directory, name)),
    })),
  );
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of files) {
    if (data.length > 8 * 1024 * 1024) throw new Error('Extension artifact exceeds size limit.');
    const checksum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(header, name, data);
    central.push(entry, name);
    offset += header.length + name.length + data.length;
  }
  const directoryBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directoryBuffer, end]);
}
