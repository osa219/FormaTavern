import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  lastModified?: Date;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const date = ((year - 1980) << 9) | (month << 5) | day;
  const time = (hours << 11) | (minutes << 5) | seconds;
  return { time, date };
}

/**
 * Builds a standard, portable ZIP archive buffer in pure TypeScript
 * using native zlib crc32 and deflate. Zero external dependencies.
 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanName = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBuf = Buffer.from(cleanName, 'utf8');
    const dataBuf = Buffer.from(entry.data);
    const uncompressedSize = dataBuf.length;
    const crc = crc32(dataBuf);

    const compressed = deflateRawSync(dataBuf);
    const useDeflate = compressed.length < uncompressedSize;
    const method = useDeflate ? 8 : 0;
    const finalData = useDeflate ? compressed : dataBuf;
    const compressedSize = finalData.length;

    const { time, date } = dosDateTime(entry.lastModified ?? new Date());

    // Local Header (30 bytes + nameBuf.length)
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4);         // version needed to extract
    lh.writeUInt16LE(0x0800, 6);     // flags: UTF-8 bit 11
    lh.writeUInt16LE(method, 8);     // compression method
    lh.writeUInt16LE(time, 10);      // mod time
    lh.writeUInt16LE(date, 12);      // mod date
    lh.writeUInt32LE(crc, 14);       // crc-32
    lh.writeUInt32LE(compressedSize, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);         // extra field len

    localChunks.push(lh, nameBuf, finalData);

    // Central Directory Header (46 bytes + nameBuf.length)
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4);         // version made by
    cd.writeUInt16LE(20, 6);         // version needed
    cd.writeUInt16LE(0x0800, 8);     // flags: UTF-8
    cd.writeUInt16LE(method, 10);    // method
    cd.writeUInt16LE(time, 12);      // time
    cd.writeUInt16LE(date, 14);      // date
    cd.writeUInt32LE(crc, 16);       // crc
    cd.writeUInt32LE(compressedSize, 20);
    cd.writeUInt32LE(uncompressedSize, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);         // extra field len
    cd.writeUInt16LE(0, 32);         // comment len
    cd.writeUInt16LE(0, 34);         // disk start
    cd.writeUInt16LE(0, 36);         // int file attr
    cd.writeUInt32LE(0, 38);         // ext file attr
    cd.writeUInt32LE(offset, 42);    // local header offset

    centralChunks.push(cd, nameBuf);
    offset += 30 + nameBuf.length + compressedSize;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const c of centralChunks) {
    cdSize += c.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4);          // disk num
  eocd.writeUInt16LE(0, 6);          // disk with cd
  eocd.writeUInt16LE(entries.length, 8); // entries on disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12);     // cd size
  eocd.writeUInt32LE(cdOffset, 16);   // cd offset
  eocd.writeUInt16LE(0, 20);          // comment len

  return new Uint8Array(Buffer.concat([...localChunks, ...centralChunks, eocd]));
}
