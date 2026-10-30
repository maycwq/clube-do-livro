// Downloads Satoshi from Fontshare into src/assets/fonts/satoshi.
//
// The ITF Free Font License lets us self-host the font on our own site but
// not redistribute it through a repository, so the files stay out of git and
// come from the official package on dev and build. Nothing is modified: the
// .woff2 files are extracted exactly as Fontshare ships them.

import { mkdir, writeFile, access } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const STYLES = ['Regular', 'Medium', 'Bold'];
const target = new URL('../src/assets/fonts/satoshi/', import.meta.url);
const source = 'https://api.fontshare.com/v2/fonts/download/satoshi';

const exists = (url) => access(url).then(() => true, () => false);
const files = STYLES.map((style) => `Satoshi-${style}.woff2`);

if ((await Promise.all(files.map((file) => exists(new URL(file, target))))).every(Boolean)) {
  process.exit(0);
}

const response = await fetch(source);
if (!response.ok) {
  console.error(`Could not download Satoshi from Fontshare (${response.status}).`);
  process.exit(1);
}
const zip = Buffer.from(await response.arrayBuffer());
const entries = readZip(zip);

await mkdir(target, { recursive: true });
for (const file of files) {
  const entry = entries.find((candidate) => candidate.name.endsWith(`/WEB/fonts/${file}`));
  if (!entry) {
    console.error(`${file} is missing from the Fontshare package.`);
    process.exit(1);
  }
  await writeFile(new URL(file, target), entry.read());
}
console.log(`Satoshi ${STYLES.join(', ')} saved to src/assets/fonts/satoshi`);

// Minimal reader for the central directory of a zip archive.
function readZip(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a zip archive');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const result = [];
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    result.push({
      name,
      read() {
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const data = buffer.subarray(start, start + compressedSize);
        if (method === 0) return data;
        if (method === 8) return inflateRawSync(data);
        throw new Error(`Unsupported compression in ${name}`);
      },
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}
